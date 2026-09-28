// The name to show for a transaction's payee: the clean name set in "Review payees with AI"
// (display_name, from payee_names) or the merchant parsed from the statement. Edits and
// lookups keep using t.merchant, the raw value.
export const payeeName = (t) => t.display_name || t.merchant;
