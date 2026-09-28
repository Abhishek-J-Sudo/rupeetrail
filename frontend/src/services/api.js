import axios from 'axios';

// Developing, the API runs on its own port; built, the same program serves it under /api
// (backend/app/server.py)
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Upload PDF file
export const uploadPDF = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// Upload PDF file with real-time progress streaming
export const uploadPDFWithProgress = (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    // Use fetch for SSE support
    fetch(`${API_BASE_URL}/upload-stream`, {
      method: 'POST',
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let finalResult = null;

        const readStream = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              // Stream complete
              if (finalResult) {
                resolve(finalResult);
              } else {
                reject(new Error('Stream ended without final result'));
              }
              return;
            }

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });

            // Parse SSE events (format: "data: {...}\n\n")
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));

                  // Check for error
                  if (data.error) {
                    reject(new Error(data.error));
                    reader.cancel();
                    return;
                  }

                  // Call progress callback
                  if (onProgress) {
                    onProgress(data);
                  }

                  // Save final result
                  if (data.percent === 100 && data.saved !== undefined) {
                    finalResult = {
                      total: data.transactions,
                      saved: data.saved,
                      duplicates: data.duplicates,
                      message: `Successfully processed ${data.filename}`,
                      elapsed: data.elapsed,
                    };
                  }
                } catch (e) {
                  console.error('Failed to parse SSE data:', e, line);
                }
              }
            }

            // Continue reading
            readStream();
          });
        };

        readStream();
      })
      .catch((error) => {
        reject(error);
      });
  });
};

// Get all transactions with optional filters
export const getTransactions = async (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.month) params.append('month', filters.month);
  if (filters.category) params.append('category', filters.category);
  if (filters.limit) params.append('limit', filters.limit);
  if (filters.offset) params.append('offset', filters.offset);
  if (filters.include_excluded) params.append('include_excluded', 'true');

  const response = await api.get(`/transactions?${params.toString()}`);
  return previewFilter(response.data);
};

// Dev only: add ?preview=empty or ?preview=2025 to the address to see the app as if only that
// data existed. Filters in the browser; nothing in the database changes.
function previewFilter(rows) {
  if (!import.meta.env.DEV) return rows;
  const preview = new URLSearchParams(window.location.search).get('preview');
  if (preview === 'empty') return [];
  if (/^\d{4}(-\d{2})?$/.test(preview || '')) return rows.filter((t) => t.date.startsWith(preview));
  return rows;
}

// Get monthly summary
export const getMonthlySummary = async (month) => {
  const response = await api.get(`/summary/${month}`);
  return response.data;
};

// Update transaction (edit category or merchant)
export const updateTransaction = async (id, updates) => {
  const response = await api.patch(`/transactions/${id}`, updates);
  return response.data;
};

// Add merchant alias
export const addMerchantAlias = async (merchant, category) => {
  const response = await api.post('/merchant-alias', {
    merchant,
    category,
  });
  return response.data;
};

// Get list of all categories
export const getCategories = async () => {
  const response = await api.get('/categories');
  return response.data.categories;
};

// Get category suggestions based on manual edits
export const getCategorySuggestions = async () => {
  const response = await api.get('/category-suggestions');
  return response.data.suggestions;
};

// Clear all transactions
export const clearDatabase = async () => {
  const response = await api.delete('/transactions');
  return response.data;
};

// Bulk update transaction categories
export const bulkUpdateCategories = async (transactionIds, category) => {
  const response = await api.post('/transactions/bulk-update', {
    transaction_ids: transactionIds,
    category: category,
  });
  return response.data;
};

// Toggle transaction exclude status
export const toggleTransactionExclude = async (transactionId, isExcluded) => {
  const response = await api.patch(`/transactions/${transactionId}/exclude?is_excluded=${isExcluded}`);
  return response.data;
};

// Toggle transaction savings status
export const toggleTransactionSavings = async (transactionId, isSavings) => {
  const response = await api.patch(`/transactions/${transactionId}/savings?is_savings=${isSavings}`);
  return response.data;
};


// Monthly recurring payments detected from history (EMIs, SIPs, subscriptions, card bills)
export const getRecurring = async () => {
  const response = await api.get('/recurring');
  return response.data;
};

// ==================== AI (bring your own key) ====================

// Providers, which one is on, models; keys come back only as a hint ("••••1234")
export const getAISettings = async () => (await api.get('/ai/settings')).data;

// { provider|null, api_key?: null keeps / "" removes, model?, base_url? }
export const saveAISettings = async (settings) => (await api.put('/ai/settings', settings)).data;

// A tiny request with these settings (a key left out = the saved one)
export const testAI = async (settings) => (await api.post('/ai/test', settings, { timeout: 60000 })).data;

export const getOllamaModels = async (baseUrl) =>
  (await api.get('/ai/ollama/models', { params: baseUrl ? { base_url: baseUrl } : {} })).data.models;


// Backend errors come back as { error } (see main.py exception handler)
export const aiErrorMessage = (err) =>
  err.response?.data?.error || err.response?.data?.detail || err.message || 'Something went wrong';

export const getAIStatus = async () => {
  const response = await api.get('/ai/status');
  return response.data;
};

// Aggregate data that would be sent for this period + any cached insight (no AI call)
// versionId: an earlier saved version of this period's insight (latest if omitted)
// period: 'YYYY-MM', 'YYYY', 'YYYY-MM:YYYY-MM' or 'all' (see periodKey). Budgets are read by the backend.
export const previewAIInsights = async (period, versionId = null) => {
  const response = await api.post('/ai/insights/preview', { period, version_id: versionId });
  return response.data;
};

// Local models (Ollama) can take a few minutes on a laptop
export const generateAIInsights = async (period) => {
  const response = await api.post('/ai/insights/generate', { period }, { timeout: 330000 });
  return response.data;
};

// Review payees with AI: saved suggestions (category + clean name), no AI call
export const getPayeeReview = async () => (await api.get('/ai/payees/review')).data;

// Exactly what a review would send
export const previewPayees = async (onlyNew = true) => (await api.get('/ai/payees/preview', { params: { only_new: onlyNew } })).data;

// onlyNew: only ask about payees not reviewed yet. A few hundred payees on a local model can take minutes.
export const suggestPayees = async (onlyNew = true) =>
  (await api.post('/ai/payees/suggest', { only_new: onlyNew }, { timeout: 900000 })).data;

// items: [{ name, merchants, category|null, display_name|null }]
export const applyPayees = async (items) => (await api.post('/ai/payees/apply', { items })).data;

export const dismissPayees = async (names) => (await api.post('/ai/payees/dismiss', { names })).data;

export default api;

// Where data lives on this computer, and whether statement files are kept after import
export const getStorageSettings = async () => (await api.get('/settings/storage')).data;

export const setKeepStatements = async (keep) =>
  (await api.put('/settings/storage', { keep_statements: keep })).data;

// Monthly budget per category and the monthly savings target: { limits: {category: amount}, savings_target }
export const getBudgets = async () => (await api.get('/budgets')).data;

export const saveBudgets = async (budgets) => (await api.put('/budgets', budgets)).data;

// Sample data ("Try with sample data"): a made-up account in its own database
export const getSample = async () => (await api.get('/sample')).data;

export const startSample = async () => (await api.post('/sample/start')).data;

export const clearSample = async () => (await api.post('/sample/clear')).data;
