# Privacy

RupeeTrail runs on your own computer. There is no RupeeTrail server, account or sign-in, and we collect nothing: no analytics, no crash reports, no usage data.

## Where your data is

- Your transactions, budgets and settings are saved in a folder on your computer (`data/` next to the app, or the folder set in `RUPEETRAIL_DATA_DIR`). Settings → Your data shows the exact path.
- When you import a statement, the file goes from your browser to the RupeeTrail app running on the same computer. It doesn't go over the internet.
- The statement file is deleted once its transactions are saved, unless you turn on "Keep a copy of statement files".
- Settings → Your data → "Delete all transactions" removes your transactions. Deleting the `data/` folder removes everything.

## AI (optional)

RupeeTrail works fully without AI. If you add your own key for an AI provider (DeepSeek, OpenAI or Anthropic):

- Something is sent **only when you press an AI button**. Nothing is sent in the background.
- **AI summary** sends: money in, spending, investments and savings for the period and the one before, spending per category, your budgets, your top business payees, and your five largest payments (a payment to a person shows only as "a person").
- **Review payees** sends: business names, each with its category, number of payments and average amount.
- **Never sent:** your name, account numbers, balances, the bank's descriptions, dated transactions, or the names of people you pay.
- It goes to **your own account** with that provider, so they can link it to you. How long they keep it, and whether they use it to train their models, is set by their terms, not ours.
- Your key is saved in `backend/.env` on your computer and is never shown in the app after saving.
- With **Ollama**, the AI runs on your computer and nothing leaves it.

Every AI screen has "Show exactly what gets sent" so you can check before sending.

## Not financial advice

RupeeTrail sorts and totals what's in your statement. It isn't financial advice, and the AI can be wrong. Check totals against your bank statement. RupeeTrail is not affiliated with HDFC Bank or any other bank.
