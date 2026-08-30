// Milestone 4 §18 — the critical accounting scenario, run against your live DB.
//   node scripts/verify-accounting.mjs
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || key.includes('xxxx')) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = Number(got) === Number(want);
  console.log(`${ok ? '✅' : '❌'} ${name}: got ${got}, want ${want}`);
  ok ? pass++ : fail++;
};

const email = `acct-test-${Date.now()}@example.com`;
let userId;

try {
  // user + family + membership
  const { data: u } = await db.auth.admin.createUser({ email, password: 'AcctTest12345', email_confirm: true });
  userId = u.user.id;
  const { data: fam } = await db.from('families').insert({ name: 'Accounting Test', created_by: userId }).select().single();
  await db.from('family_members').insert({ family_id: fam.id, user_id: userId, display_name: 'Tester', role: 'owner', status: 'active' });

  // 1–2. bank ৳50,000, card limit ৳100,000
  const { data: bank } = await db.from('accounts')
    .insert({ family_id: fam.id, name: 'Bank', type: 'bank', opening_balance: 50000, current_balance: 50000 })
    .select().single();
  const { data: card } = await db.from('credit_cards')
    .insert({ family_id: fam.id, provider: 'Test', card_name: 'Visa', credit_limit: 100000 })
    .select().single();
  check('bank opening balance', bank.current_balance, 50000);
  check('card outstanding start', card.current_outstanding, 0);
  check('card available start', card.available_credit, 100000);

  // 3–6. ৳5,000 groceries on the card
  await db.from('credit_card_transactions').insert({
    family_id: fam.id, card_id: card.id, type: 'purchase', amount: 5000,
    merchant: 'Shwapno', category_key: 'grocery', created_by: userId,
  });
  let cardRow = (await db.from('credit_cards').select('*').eq('id', card.id).single()).data;
  let bankRow = (await db.from('accounts').select('*').eq('id', bank.id).single()).data;
  let expenseTotal = ((await db.from('credit_card_transactions').select('amount, type').eq('family_id', fam.id)).data || [])
    .filter((t) => !['refund', 'adjustment'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  check('expense total after purchase', expenseTotal, 5000);
  check('card outstanding after purchase', cardRow.current_outstanding, 5000);
  check('bank balance unchanged by purchase', bankRow.current_balance, 50000);

  // 7–9. pay ৳5,000 card bill from bank
  await db.from('credit_card_payments').insert({
    family_id: fam.id, card_id: card.id, from_account_id: bank.id, amount: 5000, created_by: userId,
  });
  cardRow = (await db.from('credit_cards').select('*').eq('id', card.id).single()).data;
  bankRow = (await db.from('accounts').select('*').eq('id', bank.id).single()).data;
  check('bank balance after payment', bankRow.current_balance, 45000);
  check('card outstanding after payment', cardRow.current_outstanding, 0);

  // 10. expense total must still be 5,000
  const cashExpenses = ((await db.from('expenses').select('amount').eq('family_id', fam.id).is('deleted_at', null)).data || [])
    .reduce((s, e) => s + Number(e.amount), 0);
  expenseTotal = cashExpenses + ((await db.from('credit_card_transactions').select('amount, type').eq('family_id', fam.id)).data || [])
    .filter((t) => !['refund', 'adjustment'].includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  check('TOTAL expense still 5,000 (not 10,000)', expenseTotal, 5000);
} finally {
  if (userId) await db.auth.admin.deleteUser(userId); // cascades away everything
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
