"""
FastAPI Application

Main application with API endpoints
"""

import logging
import os
import time
import asyncio
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from datetime import datetime

from typing import Annotated, Dict

from pydantic import BaseModel, Field

from . import __version__, sample, storage
from .models import (
    Transaction, TransactionUpdate, BulkUpdateRequest, MerchantAlias,
    UploadResponse, CategorySummary, ErrorResponse
)
from .database import (
    init_db, insert_transaction, bulk_insert_transactions, get_transactions, get_summary,
    update_transaction, add_merchant_alias, get_transaction_by_id,
    get_category_suggestions, get_transactions_by_merchant, bulk_update_categories, get_connection,
    get_budgets, save_budgets, sample_active
)
from .parser.readers import pick_reader, UnrecognisedStatement
from .categorizer.learning import learn_merchant_category, get_learning_stats
from .migrations import run_migrations
from .recurring import find_recurring
from .ai.routes import router as ai_router

# Configure logging
logging.basicConfig(
    # start.py sets WARNING for people using the app and DEBUG for --dev
    level=os.getenv("RUPEETRAIL_LOG_LEVEL", "INFO").upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="RupeeTrail API",
    description="Local-first money tracking from Indian bank statements",
    version=__version__
)

# CORS: only the local frontend may read the API. A wildcard would let any
# website open in the browser read the user's transactions from 127.0.0.1:8000.
# The port is fixed in frontend/vite.config.js (strictPort).
ALLOWED_ORIGINS = ["http://localhost:5175", "http://127.0.0.1:5175"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)

# Everything is stored in the local data/ folder (see storage.py)
storage.ensure_dirs()


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    logger.info("Starting RupeeTrail API")
    init_db()
    run_migrations()
    storage.clear_incoming()
    logger.info("Database initialized")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "app": "RupeeTrail",
        "version": __version__,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


class StorageSettings(BaseModel):
    keep_statements: bool


@app.get("/settings/storage")
async def get_storage_settings():
    """Where data lives on this computer, and whether statement files are kept after import"""
    return storage.storage_info()


@app.put("/settings/storage")
async def update_storage_settings(body: StorageSettings):
    storage.save_settings({"keep_statements": body.keep_statements})
    return storage.storage_info()


# A monthly amount in rupees: 0 means "no budget"; the cap only guards against typos
Amount = Annotated[float, Field(ge=0, le=1e9, allow_inf_nan=False)]


class Budgets(BaseModel):
    limits: Dict[str, Amount] = {}
    savings_target: Optional[Amount] = None


@app.get("/sample")
async def sample_status():
    """Whether the app is showing made-up sample data"""
    return sample.status()


@app.post("/sample/start")
async def sample_start():
    """Show six months of made-up transactions (in a separate database)"""
    return sample.start()


@app.post("/sample/clear")
async def sample_clear():
    """Delete the sample data and go back to the user's own"""
    return sample.clear()


@app.get("/budgets")
async def read_budgets():
    """Monthly limit per category ({category: amount}) and the monthly savings target"""
    return get_budgets()


@app.put("/budgets")
async def replace_budgets(body: Budgets):
    """Replace every budget and the savings target; categories left out have no budget"""
    return save_budgets(body.limits, body.savings_target)


NO_TRANSACTIONS = (
    "No transactions found in this statement. Check it covers the months you picked, "
    "and that it's the statement as downloaded from your bank."
)


@app.post("/upload", response_model=UploadResponse)
async def upload_statement(file: UploadFile = File(...)):
    """
    Upload a statement (PDF or Excel), recognise which kind it is and read it

    Args:
        file: Statement file - PDF (.pdf) or Excel (.xls, .xlsx)

    Returns:
        Upload summary with counts

    Raises:
        400: Invalid file format
        422: Parsing error
        500: Server error
    """
    # Validate file type (PDF or Excel)
    file_ext = file.filename.lower().split('.')[-1] if '.' in file.filename else ''

    if file_ext not in ['pdf', 'xls', 'xlsx']:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload a PDF or Excel file (.pdf, .xls, .xlsx)."
        )

    logger.info(f"Receiving file: {file.filename}")

    # Written under a random name while it's read, then deleted or kept (storage.finish)
    temp_path = storage.incoming_path(file_ext)
    keep = storage.load_settings()["keep_statements"]
    imported = False
    try:
        contents = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(contents)

        logger.info(f"File saved to: {temp_path}")

        # Work out what kind of statement it is, then read it with that reader
        try:
            reader = pick_reader(str(temp_path), file_ext)
            logger.info(f"Reading {reader.label} (.{file_ext})...")
            transactions = reader.extract(str(temp_path))
            if not transactions:
                raise UnrecognisedStatement(NO_TRANSACTIONS)
        except UnrecognisedStatement as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            logger.error(f"File parsing failed: {e}")
            raise HTTPException(
                status_code=422,
                detail=f"Could not parse {file_ext.upper()} file: {str(e)}"
            )

        # Insert into database using bulk insert (much faster)
        # A real statement ends sample mode: it goes into the user's own database
        if sample_active():
            sample.clear()
        saved_count, duplicate_count = bulk_insert_transactions(transactions)
        imported = True

        logger.info(f"Processed {len(transactions)} transactions: {saved_count} saved, {duplicate_count} duplicates")

        return UploadResponse(
            total=len(transactions),
            saved=saved_count,
            duplicates=duplicate_count,
            message=f"Successfully processed {file.filename}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        storage.finish(temp_path, file.filename, file_ext, keep=keep and imported)


@app.post("/upload-stream")
async def upload_statement_stream(file: UploadFile = File(...)):
    """
    Upload a statement (PDF or Excel) with real-time progress streaming via SSE

    Args:
        file: Statement file - PDF (.pdf) or Excel (.xls, .xlsx)

    Returns:
        Server-Sent Events stream with progress updates

    Event format:
        data: {"stage": "...", "page": 1, "total_pages": 10, "transactions": 50, "percent": 10, "elapsed": 5.2, "eta": 42.5}
    """
    # Validate file type (PDF or Excel)
    file_ext = file.filename.lower().split('.')[-1] if '.' in file.filename else ''

    if file_ext not in ['pdf', 'xls', 'xlsx']:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload a PDF or Excel file (.pdf, .xls, .xlsx)."
        )

    # Read file content IMMEDIATELY before it gets closed
    # This must happen before we return the StreamingResponse
    temp_path = storage.incoming_path(file_ext)
    keep = storage.load_settings()["keep_statements"]
    contents = await file.read()

    # Save to disk immediately
    with open(temp_path, 'wb') as f:
        f.write(contents)

    filename = file.filename

    async def progress_generator():
        import json

        start_time = time.time()
        imported = False

        try:
            # Send initial event
            yield f"data: {json.dumps({'stage': 'Opening file...', 'page': 0, 'total_pages': 0, 'transactions': 0, 'percent': 0, 'elapsed': 0, 'eta': 0})}\n\n"
            await asyncio.sleep(0.1)

            elapsed = time.time() - start_time
            yield f"data: {json.dumps({'stage': 'File opened', 'page': 0, 'total_pages': 0, 'transactions': 0, 'percent': 5, 'elapsed': round(elapsed, 1), 'eta': 0})}\n\n"
            await asyncio.sleep(0.1)

            # Progress callback to send SSE events
            progress_data = {'total_pages': 0, 'last_page': 0}

            def progress_callback(page_num, total_pages, transactions_count, stage):
                progress_data['total_pages'] = total_pages
                progress_data['last_page'] = page_num

                # Calculate percentage (5-85% for scanning, 85-95% for DB insert)
                if total_pages > 0:
                    percent = 5 + int((page_num / total_pages) * 80)
                else:
                    percent = 5

                # Calculate elapsed time and ETA
                elapsed = time.time() - start_time
                if page_num > 0 and total_pages > 0:
                    time_per_page = elapsed / page_num
                    remaining_pages = total_pages - page_num
                    eta = time_per_page * remaining_pages
                else:
                    eta = 0

                # Return event data (will be sent by the generator)
                return {
                    'stage': stage,
                    'page': page_num,
                    'total_pages': total_pages,
                    'transactions': transactions_count,
                    'percent': percent,
                    'elapsed': round(elapsed, 1),
                    'eta': round(eta, 1)
                }

            # Extract transactions with progress tracking
            transactions = []

            # We need to run this in a thread since pdfplumber is synchronous
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as executor:
                # Create a queue to collect progress updates
                progress_queue = []

                def callback_wrapper(page_num, total_pages, transactions_count, stage):
                    event_data = progress_callback(page_num, total_pages, transactions_count, stage)
                    progress_queue.append(event_data)

                # Work out what kind of statement it is, then read it in a thread
                reader = await asyncio.get_running_loop().run_in_executor(
                    executor, pick_reader, str(temp_path), file_ext
                )
                future = executor.submit(reader.extract, str(temp_path), callback_wrapper)

                # Poll for progress updates
                last_sent_count = 0
                while not future.done():
                    await asyncio.sleep(0.2)

                    # Send all new progress updates
                    while last_sent_count < len(progress_queue):
                        event_data = progress_queue[last_sent_count]
                        yield f"data: {json.dumps(event_data)}\n\n"
                        last_sent_count += 1

                # Get the result
                transactions = future.result()

                # Send any remaining progress updates
                while last_sent_count < len(progress_queue):
                    event_data = progress_queue[last_sent_count]
                    yield f"data: {json.dumps(event_data)}\n\n"
                    last_sent_count += 1

            # Nothing read: say so rather than "Complete!", and leave sample data alone
            if not transactions:
                raise UnrecognisedStatement(NO_TRANSACTIONS)

            # Insert into database
            elapsed = time.time() - start_time
            yield f"data: {json.dumps({'stage': 'Saving to database...', 'page': progress_data['total_pages'], 'total_pages': progress_data['total_pages'], 'transactions': len(transactions), 'percent': 85, 'elapsed': round(elapsed, 1), 'eta': 0})}\n\n"
            await asyncio.sleep(0.1)

            saved_count = 0
            duplicate_count = 0

            # Use bulk insert for much faster database writes
            # A real statement ends sample mode: it goes into the user's own database
            if sample_active():
                sample.clear()
            saved_count, duplicate_count = bulk_insert_transactions(transactions)
            imported = True

            # Send completion event
            elapsed = time.time() - start_time
            yield f"data: {json.dumps({'stage': 'Complete!', 'page': progress_data['total_pages'], 'total_pages': progress_data['total_pages'], 'transactions': len(transactions), 'percent': 100, 'elapsed': round(elapsed, 1), 'eta': 0, 'saved': saved_count, 'duplicates': duplicate_count, 'filename': filename})}\n\n"

        except Exception as e:
            logger.error(f"Upload failed: {e}")
            yield f"data: {json.dumps({'error': str(e), 'stage': 'Error', 'percent': 0})}\n\n"

        finally:
            storage.finish(temp_path, filename, file_ext, keep=keep and imported)

    return StreamingResponse(
        progress_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/transactions", response_model=List[Transaction])
async def list_transactions(
    month: Optional[str] = Query(None, description="Filter by month (YYYY-MM)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(100, ge=1, le=50000, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    include_excluded: bool = Query(False, description="Include excluded transactions")
):
    """
    Get transactions with optional filters

    Args:
        month: Filter by month (YYYY-MM format)
        category: Filter by category
        limit: Maximum results (1-50000)
        offset: Pagination offset
        include_excluded: Include excluded transactions (default: False)

    Returns:
        List of transactions
    """
    try:
        transactions = get_transactions(
            month=month,
            category=category,
            limit=limit,
            offset=offset,
            include_excluded=include_excluded
        )
        return transactions
    except Exception as e:
        logger.error(f"Failed to get transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/summary/{month}", response_model=List[CategorySummary])
async def monthly_summary(month: str):
    """
    Get spending summary by category for a month

    Args:
        month: Month in YYYY-MM format (e.g., "2025-01")

    Returns:
        List of category summaries with totals and percentages
    """
    # Validate month format
    import re
    if not re.match(r'^\d{4}-\d{2}$', month):
        raise HTTPException(
            status_code=400,
            detail="Invalid month format. Use YYYY-MM (e.g., 2025-01)"
        )

    try:
        summary = get_summary(month)
        return summary
    except Exception as e:
        logger.error(f"Failed to get summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/transactions/{transaction_id}")
async def update_transaction_endpoint(
    transaction_id: int,
    data: TransactionUpdate
):
    """
    Update transaction merchant or category

    When a category is updated, the system learns this correction and will
    find similar transactions from the same merchant for bulk update.

    Args:
        transaction_id: Transaction ID
        data: Update data (merchant and/or category)

    Returns:
        {
            "transaction": Updated transaction,
            "similar_transactions": List of similar transactions (if category changed)
        }

    Raises:
        404: Transaction not found
    """
    # Get current transaction before update
    current = get_transaction_by_id(transaction_id)
    if not current:
        raise HTTPException(
            status_code=404,
            detail=f"Transaction {transaction_id} not found"
        )

    # Update the transaction
    success = update_transaction(
        txn_id=transaction_id,
        merchant=data.merchant,
        category=data.category
    )

    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Transaction {transaction_id} not found"
        )

    # SMART LEARNING: If category was changed, learn this correction
    similar_transactions = []
    if data.category and data.category != current['category']:
        merchant_name = data.merchant if data.merchant else current['merchant']
        learn_result = learn_merchant_category(merchant_name, data.category)
        if learn_result:
            logger.info(f"🧠 Learned: '{merchant_name}' → '{data.category}'")

        # Find similar transactions from same merchant (excluding current one)
        similar_transactions = get_transactions_by_merchant(merchant_name, exclude_id=transaction_id)
        logger.info(f"Found {len(similar_transactions)} similar transactions for '{merchant_name}'")

    # Get and return updated transaction
    updated = get_transaction_by_id(transaction_id)
    if not updated:
        raise HTTPException(
            status_code=404,
            detail=f"Transaction {transaction_id} not found"
        )

    return {
        "transaction": updated,
        "similar_transactions": similar_transactions
    }


@app.post("/transactions/bulk-update")
async def bulk_update_transaction_categories(data: BulkUpdateRequest):
    """
    Bulk update category for multiple transactions

    Args:
        data: BulkUpdateRequest with transaction_ids and category

    Returns:
        {
            "updated_count": Number of transactions updated,
            "category": Category applied
        }

    Raises:
        400: Invalid input
    """
    if not data.transaction_ids:
        raise HTTPException(
            status_code=400,
            detail="No transaction IDs provided"
        )

    try:
        updated_count = bulk_update_categories(data.transaction_ids, data.category)
        logger.info(f"Bulk updated {updated_count} transactions to '{data.category}'")

        return {
            "updated_count": updated_count,
            "category": data.category,
            "transaction_ids": data.transaction_ids
        }
    except Exception as e:
        logger.error(f"Bulk update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/transactions/{transaction_id}/exclude")
async def toggle_transaction_exclude(transaction_id: int, is_excluded: bool = Query(...)):
    """
    Toggle transaction exclude status

    Args:
        transaction_id: Transaction ID
        is_excluded: True to exclude, False to include

    Returns:
        Updated transaction
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Check if transaction exists
        cursor.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

        # Update is_excluded status
        cursor.execute(
            "UPDATE transactions SET is_excluded = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if is_excluded else 0, transaction_id)
        )
        conn.commit()

        # Get updated transaction
        cursor.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            updated = dict(row)
            action = "excluded" if is_excluded else "included"
            logger.info(f"Transaction {transaction_id} {action}")
            return {"transaction": updated, "message": f"Transaction {action} successfully"}
        else:
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle exclude: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/transactions/{transaction_id}/savings")
async def toggle_transaction_savings(transaction_id: int, is_savings: bool = Query(...)):
    """
    Toggle transaction savings status

    Args:
        transaction_id: Transaction ID
        is_savings: True to mark as savings, False to unmark

    Returns:
        Updated transaction
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Check if transaction exists
        cursor.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

        # Update is_savings_transfer status
        cursor.execute(
            "UPDATE transactions SET is_savings_transfer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if is_savings else 0, transaction_id)
        )
        conn.commit()

        # Get updated transaction
        cursor.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            updated = dict(row)
            action = "marked as savings" if is_savings else "unmarked as savings"
            logger.info(f"Transaction {transaction_id} {action}")
            return {"transaction": updated, "message": f"Transaction {action} successfully"}
        else:
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle savings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/merchant-alias")
async def create_merchant_alias(data: MerchantAlias):
    """
    Create merchant alias for better categorization

    Args:
        data: Merchant alias data

    Returns:
        Success message
    """
    try:
        success = add_merchant_alias(
            merchant=data.merchant,
            alias=data.alias,
            category=data.category
        )

        if success:
            return {"message": f"Alias created: {data.merchant} -> {data.alias}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to create alias")

    except Exception as e:
        logger.error(f"Failed to create alias: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recurring")
async def list_recurring():
    """Monthly recurring payments (EMIs, SIPs, subscriptions, card bills) detected from history"""
    return find_recurring()


@app.get("/categories")
async def list_categories():
    """
    Get list of all available categories

    Returns:
        List of category names
    """
    from .categorizer.rules import get_all_categories
    return {"categories": get_all_categories()}


@app.get("/category-suggestions")
async def list_category_suggestions():
    """
    Get merchant-to-category suggestions based on manual edits

    Analyzes user's manual category changes to suggest improvements
    to categorization rules.

    Returns:
        List of suggestions with confidence scores
    """
    try:
        suggestions = get_category_suggestions()
        return {"suggestions": suggestions}
    except Exception as e:
        logger.error(f"Failed to get suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/learning/stats")
async def get_learning_statistics():
    """
    Get smart learning statistics

    Shows how many merchants have been learned from user corrections
    and which categories are most commonly corrected.

    Returns:
        Learning statistics including:
        - total_learned: Total number of learned merchants
        - by_category: Breakdown by category
        - recent: Recently learned merchants
        - cache_size: In-memory cache size
    """
    try:
        stats = get_learning_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get learning stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/transactions")
async def clear_database():
    """
    Clear all transactions from the database

    Returns:
        Number of transactions deleted
    """
    try:
        from .database import clear_all_transactions
        count = clear_all_transactions()
        logger.info(f"Cleared {count} transactions from database")
        return {"message": f"Successfully cleared {count} transactions", "count": count}
    except Exception as e:
        logger.error(f"Failed to clear database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}")
    # This handler runs outside the CORS middleware, so add the header ourselves;
    # without it the browser hides the real error behind a generic "Network Error".
    # Only echo the origin back when it's one we allow.
    origin = request.headers.get("origin")
    headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in ALLOWED_ORIGINS else {}
    return JSONResponse(
        status_code=500,
        content={"error": f"Internal server error: {exc}", "detail": str(exc)},
        headers=headers,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )

