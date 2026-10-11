(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let hasHousehold = false;
  let currentImport = null;
  let householdCurrency = 'USD';
  let monthlyTransactionChart = null;

  function applyLanguage(language) {
    const locale = language === 'fa' || language === 'ar' ? language : 'en';
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'en' ? 'ltr' : 'rtl';
  }

  function status(message, good = false) {
    $('status').textContent = message || '';
    $('status').style.color = good ? '#1d5b4a' : '#8c302e';
    if (!message) return;
    const toast = document.createElement('div'); toast.className = `toast ${good ? 'toast-success' : 'toast-error'}`; toast.textContent = message; $('toastRegion').append(toast);
    window.setTimeout(() => toast.remove(), 5200);
  }

  function show(panel) {
    for (const id of ['authPanel', 'passwordChangePanel', 'setupPanel', 'dashboardPanel', 'reportsPanel', 'profilePanel', 'settingsPanel', 'rulesPanel', 'adminPanel']) $(id).hidden = id !== panel;
    $('appNav').hidden = panel === 'authPanel';
    $('headerActions').hidden = panel === 'authPanel' || panel === 'passwordChangePanel' || panel === 'setupPanel';
    if (panel === 'authPanel') { $('avatarMenu').hidden = true; $('mobileMenuButton').setAttribute('aria-expanded', 'false'); document.querySelector('.shell').classList.remove('mobile-nav-open'); $('navBackdrop').hidden = true; }
  }

  async function api(path, method = 'GET', body) {
    const headers = { 'x-ourpot-request': '1' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Request failed');
      if (typeof data.retryAfterSeconds === 'number') error.retryAfterSeconds = data.retryAfterSeconds;
      throw error;
    }
    return data;
  }

  function formObject(form) { return Object.fromEntries(new FormData(form)); }
  function item(list, text, action) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = text;
    li.append(span);
    if (action) li.append(action);
    list.append(li);
  }
  function button(label, onClick, danger = false) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label;
    if (danger) el.className = 'danger';
    el.addEventListener('click', () => perform(onClick));
    return el;
  }
  async function perform(work) {
    try { status(''); await work(); } catch (error) {
      status(error.retryAfterSeconds ? `${error.message} You can try again when the timer expires.` : (error.message || 'Request failed'));
    }
  }
  function bindForm(id, handler) {
    $(id).addEventListener('submit', (event) => {
      event.preventDefault();
      perform(() => handler(formObject(event.currentTarget)));
    });
  }

  $('collapseNavButton').addEventListener('click', () => {
    const shell = document.querySelector('.shell'); const collapsed = shell.classList.toggle('nav-collapsed');
    $('collapseNavButton').setAttribute('aria-pressed', String(collapsed)); $('collapseNavButton').setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
    localStorage.setItem('ourpot.navCollapsed', String(collapsed));
  });
  $('mobileMenuButton').addEventListener('click', () => {
    const shell = document.querySelector('.shell'); const open = shell.classList.toggle('mobile-nav-open'); $('mobileMenuButton').setAttribute('aria-expanded', String(open)); $('mobileMenuButton').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); $('navBackdrop').hidden = !open;
  });
  $('navBackdrop').addEventListener('click', () => $('mobileMenuButton').click());
  $('avatarMenuButton').addEventListener('click', () => { const menu = $('avatarMenu'); const open = menu.hidden; menu.hidden = !open; $('avatarMenuButton').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.avatar-menu-wrap')) { $('avatarMenu').hidden = true; $('avatarMenuButton').setAttribute('aria-expanded', 'false'); } });
  for (const [buttonId, navId] of [['avatarProfileButton', 'profileNav'], ['avatarSettingsButton', 'settingsNav'], ['avatarRulesButton', 'rulesNav'], ['avatarAdminButton', 'adminNav']]) {
    $(buttonId).addEventListener('click', () => { $(navId).click(); $('avatarMenu').hidden = true; });
  }
  $('avatarLogoutButton').addEventListener('click', () => $('logoutButton').click());
  $('inviteRibbonButton').addEventListener('click', () => $('settingsNav').click());
  $('dismissInviteRibbon').addEventListener('click', () => { $('inviteRibbon').hidden = true; localStorage.setItem('ourpot.inviteRibbonDismissed', 'true'); });
  function toggleNewMenu() {
    const menu = $('newItemMenu');
    const open = menu.hidden;
    menu.hidden = !open;
    $('newDashboardButton').setAttribute('aria-expanded', String(open));
  }
  function closeNewMenu() {
    $('newItemMenu').hidden = true;
    $('newDashboardButton').setAttribute('aria-expanded', 'false');
  }
  let modalFormOrigin = null; let editingRecord = null;
  function openNewItem(targetId, title, record = null) {
    const target = $(targetId); const modal = $('newItemModal');
    modalFormOrigin = { target, parent: target.parentElement, next: target.nextSibling };
    $('newItemModalTitle').textContent = title;
    $('newItemModalBody').append(target);
    editingRecord = record;
    if (record) for (const [name, value] of Object.entries(record)) if (target.elements[name]) target.elements[name].value = value ?? '';
    modal.showModal();
    const firstField = target.querySelector('input, select, textarea');
    if (firstField) window.setTimeout(() => firstField.focus(), 50);
  }
  function closeNewItem() {
    const modal = $('newItemModal');
    if (modal.open) modal.close();
    if (modalFormOrigin) { modalFormOrigin.parent.insertBefore(modalFormOrigin.target, modalFormOrigin.next); modalFormOrigin = null; } editingRecord = null;
  }
  $('newDashboardButton').addEventListener('click', toggleNewMenu);
  $('mobileNewFab').addEventListener('click', toggleNewMenu);
  for (const choice of document.querySelectorAll('[data-new-target]')) {
    choice.addEventListener('click', () => {
      closeNewMenu();
      openNewItem(choice.dataset.newTarget, choice.textContent);
    });
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.dashboard-actions') && !event.target.closest('#mobileNewFab')) closeNewMenu();
  });
  $('closeNewItemModal').addEventListener('click', closeNewItem);
  $('newItemModal').addEventListener('cancel', (event) => { event.preventDefault(); closeNewItem(); });
  $('newItemModal').addEventListener('click', (event) => { if (event.target === $('newItemModal')) closeNewItem(); });
  $('totalsHelpButton').addEventListener('click', () => $('totalsHelpModal').showModal());
  $('closeTotalsHelp').addEventListener('click', () => $('totalsHelpModal').close());
  const menuIcons = {
    avatarProfileButton: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
    avatarSettingsButton: '<path d="M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0 -8"/><path d="M3 12h2m14 0h2M12 3v2m0 14v2m6.364 -14.364l-1.414 1.414m-9.9 9.9l-1.414 1.414m0 -12.728l1.414 1.414m9.9 9.9l1.414 1.414"/>',
    avatarRulesButton: '<path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 5v0m8 7v0m-4 7v0"/>',
    avatarAdminButton: '<path d="M12 3l8 4v5c0 4.5-3.4 7.6-8 9c-4.6-1.4-8-4.5-8-9V7l8-4z"/>',
    avatarLogoutButton: '<path d="M10 17l5-5l-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0 -2 -2h-6"/>',
  };
  for (const [id, body] of Object.entries(menuIcons)) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('tabler-icon', 'menu-icon'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.innerHTML = body; $(id).prepend(svg); }
  if (localStorage.getItem('ourpot.navCollapsed') === 'true') { document.querySelector('.shell').classList.add('nav-collapsed'); $('collapseNavButton').setAttribute('aria-pressed', 'true'); }

  async function checkAuth() {
    try {
      const me = await api('/api/auth/me');
      hasHousehold = !!me.household;
      $('adminNav').hidden = me.systemRole !== 'root_admin';
      $('avatarAdminButton').hidden = me.systemRole !== 'root_admin';
      if (me.mustChangePassword) show('passwordChangePanel');
      else {
        const language = await api('/api/settings/language');
        applyLanguage(language.language);
        if (me.systemRole === 'root_admin') { show('adminPanel'); await adminUsers(); }
        else if (hasHousehold) { show('dashboardPanel'); await dashboard(); }
        else show('setupPanel');
      }
    } catch (error) {
      if (error.message === 'Authentication required') show('authPanel');
      else status(error.message);
    }
  }

  async function passwordLogin(values) {
    const result = await api('/api/auth/login', 'POST', values);
    if (result.kind === 'mfa_required') {
      $('passwordPanel').hidden = true; $('mfaPanel').hidden = false; $('mfaForm').reset();
      status('Enter your authenticator code or a recovery code.', true);
    } else {
      $('passwordPanel').hidden = false; $('mfaPanel').hidden = true;
      await checkAuth(); status('Signed in.', true);
    }
  }

  async function prepareInvitation(token) {
    try {
      const details = await api('/api/invitations/' + encodeURIComponent(token));
      $('inviteJoinEmail').value = details.email;
      $('inviteJoinDescription').textContent = `Create an account to join ${details.householdName}.`;
      $('inviteSignupForm').elements.token.value = token;
      show('authPanel'); $('passwordPanel').hidden = true; $('inviteJoinPanel').hidden = false;
    } catch (error) {
      status(error.message || 'This invitation is no longer available.');
    }
  }

  async function dashboard() {
    const data = await api('/api/dashboard');
    householdCurrency = data.currency || 'USD';
    const memberNames = Object.fromEntries((data.members || []).map((member) => [member.userId, member.displayName]));
    document.querySelectorAll('.currency-label').forEach((label) => { label.textContent = `(${householdCurrency})`; });
    $('inviteRibbon').hidden = data.hasPendingInvitation || localStorage.getItem('ourpot.inviteRibbonDismissed') === 'true';
    $('income').textContent = formatAmount(data.totals.householdIncome);
    $('expense').textContent = formatAmount(data.totals.householdExpense);
    $('netChange').textContent = formatAmount(data.totals.householdIncome - data.totals.householdExpense);
    $('balance').textContent = formatAmount(data.accounts.reduce((total, account) => total + account.balance, 0));
    const accounts = $('accountList'); accounts.replaceChildren();
    const recentTransactions = $('recentTransactions'); recentTransactions.replaceChildren();
    for (const account of data.accounts.filter((entry) => !entry.archived)) {
      const card = document.createElement('article'); card.className = 'account-card';
      const icon = document.createElement('span'); icon.className = 'account-card-icon'; icon.innerHTML = '<i class="ti ti-wallet"></i>';
      const title = document.createElement('strong'); title.textContent = account.name;
      const balance = document.createElement('b'); balance.className = account.balance < 0 ? 'negative-balance' : ''; balance.textContent = formatAmount(account.balance);
      const meta = document.createElement('small'); meta.textContent = `${account.type} · opening ${formatAmount(account.openingBalance)}`;
      const edit = document.createElement('button'); edit.className = 'icon-button'; edit.title = 'Edit'; edit.ariaLabel = 'Edit account'; edit.innerHTML = '<i class="ti ti-edit"></i>'; edit.onclick = () => openNewItem('accountForm', 'Edit account', { id: account.id, name: account.name, type: account.type, openingBalance: account.openingBalance });
      const remove = document.createElement('button'); remove.className = 'icon-button danger-icon'; remove.title = 'Remove'; remove.ariaLabel = 'Remove account'; remove.innerHTML = '<i class="ti ti-trash"></i>'; remove.onclick = () => perform(async () => { if (!window.confirm(`Archive account “${account.name}”? Existing transactions will be kept.`)) return; await api(`/api/accounts/${encodeURIComponent(account.id)}`, 'DELETE'); await dashboard(); status('Account archived.', true); });
      const actions = document.createElement('div'); actions.className = 'account-card-actions'; actions.append(edit, remove); card.append(icon, title, balance, meta, actions); accounts.append(card);
    }
    const add = document.createElement('button'); add.type = 'button'; add.className = 'account-card account-card-add'; add.innerHTML = '<i class="ti ti-plus"></i><span>Add account</span>'; add.onclick = () => openNewItem('accountForm', 'New account'); accounts.append(add);
    for (const transaction of data.transactions || []) {
      const row = document.createElement('tr');
      row.className = `transaction-row-${transaction.type}`;
      const iconCell = document.createElement('td'); const icon = document.createElement('span'); icon.className = `transaction-icon ${transaction.type}`;
      const typeIcons = { income: 'trending-up', expense: 'trending-down', transfer: 'arrows-exchange', adjustment: 'adjustments' };
      const typeIcon = document.createElement('i'); typeIcon.className = `ti ti-${typeIcons[transaction.type] || 'receipt'}`; typeIcon.setAttribute('aria-hidden', 'true'); icon.append(typeIcon); iconCell.append(icon);
      const main = document.createElement('td'); main.className = 'transaction-main'; const title = document.createElement('strong'); title.textContent = transaction.description; const meta = document.createElement('small'); meta.textContent = `${transaction.transactionDate} · ${transaction.category || 'Uncategorized'}`; main.append(title, meta);
      const total = document.createElement('td'); const totalValue = document.createElement('strong'); totalValue.className = `transaction-amount ${transaction.type}`; totalValue.textContent = `${transaction.type === 'expense' ? '−' : transaction.type === 'income' ? '+' : ''}${formatAmount(transaction.amount)}`; total.append(totalValue);
      const actionsCell = document.createElement('td'); actionsCell.className = 'row-actions'; const edit = document.createElement('button'); edit.className = 'icon-button'; edit.title = 'Edit'; edit.ariaLabel = 'Edit transaction'; edit.innerHTML = '<i class="ti ti-edit"></i>'; edit.onclick = () => openNewItem('transactionForm', 'Edit transaction', { id: transaction.id, accountId: transaction.accountId, type: transaction.type, amount: transaction.amount, description: transaction.description, category: transaction.category || 'General' }); const remove = document.createElement('button'); remove.className = 'icon-button danger-icon'; remove.title = 'Remove'; remove.ariaLabel = 'Remove transaction'; remove.innerHTML = '<i class="ti ti-trash"></i>'; remove.onclick = () => perform(async () => { if (!window.confirm('Remove this transaction?')) return; await api(`/api/transactions/${encodeURIComponent(transaction.id)}`, 'DELETE'); await dashboard(); status('Transaction removed.', true); }); actionsCell.append(edit, remove); row.append(iconCell, main, total, actionsCell); recentTransactions.append(row);
    }
    renderTransactionChart(data.monthTransactions || []);
    const audits = $('auditList'); audits.replaceChildren();
    for (const event of (data.audits || []).slice(-8).reverse()) {
      item(audits, event.action + ' · ' + event.entityType + ' · by ' + (memberNames[event.actorUserId] || 'Household member'));
    }
    for (const select of [$('accounts'), $('destinationAccounts')]) {
      select.replaceChildren();
      const activeAccounts = data.accounts.filter((entry) => !entry.archived);
      if (!activeAccounts.length) {
        const option = document.createElement('option');
        option.textContent = 'There is no account'; option.value = ''; option.disabled = true; option.selected = true;
        select.append(option);
      }
      for (const account of activeAccounts) {
        const option = document.createElement('option');
        option.value = account.id; option.textContent = account.name;
        select.append(option);
      }
    }
    const importAccount = $('importAccount');
    if (importAccount) {
      importAccount.replaceChildren();
      for (const account of data.accounts.filter((entry) => !entry.archived)) {
        const option = document.createElement('option'); option.value = account.id; option.textContent = account.name; importAccount.append(option);
      }
      if (!importAccount.options.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'There is no account'; option.disabled = true; importAccount.append(option); }
    }
    $('transactionForm').querySelector('button').disabled = !data.accounts.some((entry) => !entry.archived);
    renderDashboardVisuals(data.report);
    renderPartnerTotals(data, memberNames);
    renderPlanning(data, memberNames);
  }

  function formatAmount(value) { return new Intl.NumberFormat(document.documentElement.lang || 'en-US', { style: 'currency', currency: householdCurrency, minimumFractionDigits: 2 }).format(Number(value) / 100); }

  function renderTransactionChart(transactions) {
    if (monthlyTransactionChart) monthlyTransactionChart.destroy();
    if (typeof Chart === 'undefined') return;
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth() + 1;
    const days = today.getDate(); const income = Array(days).fill(0); const expenses = Array(days).fill(0);
    for (const transaction of transactions) {
      const [rowYear, rowMonth, rowDay] = transaction.transactionDate.split('-').map(Number);
      if (rowYear !== year || rowMonth !== month || rowDay < 1 || rowDay > days) continue;
      if (transaction.type === 'income') income[rowDay - 1] += transaction.amount / 100;
      if (transaction.type === 'expense') expenses[rowDay - 1] += transaction.amount / 100;
    }
    monthlyTransactionChart = new Chart($('transactionChart'), {
      type: 'line',
      data: { labels: Array.from({ length: days }, (_, index) => String(index + 1)), datasets: [
        { label: 'Income', data: income, borderColor: '#18a577', backgroundColor: 'rgba(24,165,119,.12)', fill: true, tension: .38, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5 },
        { label: 'Expenses', data: expenses, borderColor: '#e1636d', backgroundColor: 'rgba(225,99,109,.09)', fill: true, tension: .38, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 550 }, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatAmount(Math.round(context.parsed.y * 100))}` } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, border: { display: false }, grid: { color: '#e9edf5' }, ticks: { callback: (value) => formatAmount(Number(value) * 100) } } } },
    });
  }

  function renderDashboardVisuals(report) {
    const chart = $('dashboardChart'); chart.replaceChildren();
    if (!report || (!report.household.income && !report.household.expense)) { $('dashboardChartSummary').textContent = 'No income or expenses recorded this month.'; }
    else {
      const max = Math.max(report.household.income, report.household.expense, 1);
      for (const [label, value, color] of [['Income', report.household.income, '#1d5b4a'], ['Expenses', report.household.expense, '#a43e45']]) {
        const row = document.createElement('div'); row.className = 'chart-row'; const name = document.createElement('span'); name.textContent = label; const track = document.createElement('span'); track.className = 'chart-track'; const bar = document.createElement('span'); bar.className = 'chart-bar'; bar.style.inlineSize = (value / max * 100) + '%'; bar.style.backgroundColor = color; track.append(bar); const amount = document.createElement('strong'); amount.textContent = formatAmount(value); row.append(name, track, amount); chart.append(row);
      }
      $('dashboardChartSummary').textContent = 'Net change: ' + formatAmount(report.household.net) + '.';
    }
    const categories = $('dashboardCategoryList'); categories.replaceChildren(); const entries = Object.entries(report?.byCategory || {}); if (!entries.length) item(categories, 'No expenses by category yet.'); for (const [category, amount] of entries) item(categories, category + ' · ' + formatAmount(amount));
  }

  function renderPartnerTotals(data, memberNames) {
    const byEntrant = data.totals.byEntrant || {};
    const members = data.members || [];
    const ids = members.length ? members.map((member) => member.userId) : Object.keys(byEntrant);
    if (members.length === 1) ids.push(null);
    const container = $('partnerTotals'); container.replaceChildren();
    if (!ids.length) {
      const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Waiting for household members.'; container.append(empty); return;
    }
    for (const userId of ids) {
      if (userId === null) {
        const waiting = document.createElement('article'); waiting.className = 'partner-summary waiting';
        const heading = document.createElement('h3'); heading.textContent = 'Waiting for partner'; waiting.append(heading);
        const message = document.createElement('p'); message.className = 'hint'; message.textContent = 'Invite your partner to see their activity here.'; waiting.append(message);
        container.append(waiting); continue;
      }
      const totals = byEntrant[userId] || { income: 0, expense: 0 };
      const article = document.createElement('article'); article.className = 'partner-summary';
      const heading = document.createElement('h3'); heading.textContent = memberNames[userId] || 'Household member'; article.append(heading);
      const values = document.createElement('div'); values.className = 'partner-summary-values';
      for (const [label, value] of [['Income entered', totals.income], ['Expenses entered', totals.expense], ['Net entered', totals.income - totals.expense]]) {
        const row = document.createElement('div');
        const name = document.createElement('span'); name.className = 'label'; name.textContent = label;
        const amount = document.createElement('strong'); amount.textContent = formatAmount(value);
        row.append(name, amount); values.append(row);
      }
      article.append(values); container.append(article);
    }
  }

  function renderPlanning(data, memberNames) {
    const budgets = $('budgetList'); budgets.replaceChildren();
    for (const budget of data.budgets || []) { const row = document.createElement('tr'); row.innerHTML = `<td>${budget.category}<small>${budget.period}</small></td><td>${formatAmount(budget.amount)}</td><td>${budget.status}</td><td class="row-actions"><button class="icon-button" title="Edit" aria-label="Edit budget"><i class="ti ti-edit"></i></button><button class="icon-button danger-icon" title="Remove" aria-label="Remove budget"><i class="ti ti-trash"></i></button></td>`; row.querySelector('[title="Edit"]').onclick = () => openNewItem('budgetForm', 'Edit budget proposal', { amount: budget.amount, period: budget.period, rationale: budget.rationale }); row.querySelector('[title="Remove"]').onclick = () => removePlanning('budget', budget.id); budgets.append(row); }
    const goals = $('goalList'); goals.replaceChildren();
    for (const goal of data.goals || []) { const card = document.createElement('article'); card.className = 'goal-card'; card.innerHTML = `<span class="goal-icon"><i class="ti ti-target"></i></span><strong>${goal.name}</strong><span>${formatAmount(goal.contributedAmount)} / ${formatAmount(goal.targetAmount)}</span><small>${goal.status}</small><div class="row-actions"><button class="icon-button" title="Edit" aria-label="Edit goal"><i class="ti ti-edit"></i></button><button class="icon-button danger-icon" title="Remove" aria-label="Remove goal"><i class="ti ti-trash"></i></button></div>`; card.querySelector('[title="Edit"]').onclick = () => openNewItem('goalForm', 'Edit savings goal', { name: goal.name, targetAmount: goal.targetAmount }); card.querySelector('[title="Remove"]').onclick = () => removePlanning('goal', goal.id); goals.append(card); } const goalAdd = document.createElement('button'); goalAdd.type='button'; goalAdd.className='goal-card goal-card-add'; goalAdd.innerHTML='<i class="ti ti-plus"></i><span>New savings goal</span>'; goalAdd.onclick=()=>openNewItem('goalForm','New savings goal'); goals.append(goalAdd);
    const tasks = $('taskList'); tasks.replaceChildren();
    for (const task of data.tasks || []) { const row = document.createElement('tr'); row.innerHTML = `<td>${task.title}<small>${memberNames[task.assigneeId] || 'Household member'}</small></td><td>${task.dueDate}</td><td>${task.status}</td><td class="row-actions"><button class="icon-button" title="Edit" aria-label="Edit task"><i class="ti ti-edit"></i></button><button class="icon-button danger-icon" title="Remove" aria-label="Remove task"><i class="ti ti-trash"></i></button></td>`; row.querySelector('[title="Edit"]').onclick = () => openNewItem('taskForm', 'Edit required task', { title: task.title, dueDate: task.dueDate }); row.querySelector('[title="Remove"]').onclick = () => removePlanning('task', task.id); tasks.append(row); }
    const subscriptions = $('subscriptionList'); subscriptions.replaceChildren();
    for (const subscription of data.subscriptions || []) { const row = document.createElement('tr'); row.innerHTML = `<td>${subscription.name}<small>${subscription.cadence}</small></td><td>${formatAmount(subscription.price)}</td><td>${subscription.nextRenewalDate}</td><td class="row-actions"><button class="icon-button" title="Edit" aria-label="Edit subscription"><i class="ti ti-edit"></i></button><button class="icon-button danger-icon" title="Remove" aria-label="Remove subscription"><i class="ti ti-trash"></i></button></td>`; row.querySelector('[title="Edit"]').onclick = () => openNewItem('subscriptionForm', 'Edit subscription', { name: subscription.name, price: subscription.price, cadence: subscription.cadence, nextRenewalDate: subscription.nextRenewalDate }); row.querySelector('[title="Remove"]').onclick = () => removePlanning('subscription', subscription.id); subscriptions.append(row); }
    const reminders = $('reminderList'); reminders.replaceChildren();
    for (const reminder of data.reminders || []) item(reminders, `Reminder · renewal ${reminder.renewalDate} · ${reminder.leadDays} days before`);
  }
  async function removePlanning(type, id) { const labels = { budget: 'budget proposal', goal: 'savings goal', task: 'required task', subscription: 'subscription' }; const label = labels[type] || 'record'; if (!window.confirm(`Remove this ${label}? This cannot be undone.`)) return; await api(`/api/${type}s/${encodeURIComponent(id)}`, 'DELETE'); await dashboard(); status(`${label[0].toUpperCase() + label.slice(1)} removed.`, true); }

  async function rules() {
    show('rulesPanel');
    const data = await api('/api/rules');
    const form = $('rulesForm');
    form.elements.subscriptionReminders.checked = data.subscriptionReminders;
    form.elements.taskDueReminders.checked = data.taskDueReminders;
    form.elements.notifyBothPartners.checked = data.notifyBothPartners;
    form.elements.budgetWarningPercent.value = data.budgetWarningPercent ?? '';
    $('rulesStatus').textContent = 'Saved household defaults.';
  }

  async function reports() {
    show('reportsPanel');
    const form = $('reportForm');
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    if (!form.elements.from.value) form.elements.from.value = start;
    if (!form.elements.to.value) form.elements.to.value = end;
    await loadReport(form.elements.from.value, form.elements.to.value);
  }
  async function loadReport(from, to) {
    $('reportStatus').textContent = 'Loading report…';
    const data = await api('/api/reports?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
    $('reportSummary').hidden = false;
    $('reportIncome').textContent = formatAmount(data.household.income);
    $('reportExpense').textContent = formatAmount(data.household.expense);
    $('reportNet').textContent = formatAmount(data.household.net);
    const categories = $('reportCategories'); categories.replaceChildren();
    const categoryEntries = Object.entries(data.byCategory);
    if (!categoryEntries.length) item(categories, 'No expenses in this range.');
    for (const [category, amount] of categoryEntries) item(categories, category + ' · ' + formatAmount(amount));
    const monthly = $('reportMonthly'); monthly.replaceChildren();
    if (!data.monthly.length) item(monthly, 'No income or expenses in this range.');
    for (const row of data.monthly) item(monthly, row.month + ' · income ' + row.income + ' · expenses ' + row.expense + ' · net ' + row.net);
    $('reportStatus').textContent = 'Showing ' + data.range.from + ' through ' + data.range.to + '.';
  }

  function renderImportRows() {
    const list = $('importRows'); list.replaceChildren();
    for (const row of currentImport.rows) {
      const label = `${row.transactionDate} · ${row.type} · ${formatAmount(row.amountMinor)} · ${row.description}${row.duplicateOf ? ' · duplicate in file' : ''}`;
      const decision = row.decision || 'pending';
      const actions = document.createElement('span');
      actions.append(button(decision === 'accept' ? 'Accepted' : 'Accept', async () => { await reviewImportRow(row.id, 'accept'); }, decision === 'accept'));
      actions.append(button(decision === 'skip' ? 'Skipped' : 'Skip', async () => { await reviewImportRow(row.id, 'skip'); }, decision === 'skip'));
      item(list, label + ' · ' + decision, actions);
    }
    const ready = currentImport.rows.every((row) => row.decision === 'accept' || row.decision === 'skip');
    $('commitImportButton').disabled = !ready;
    $('importStatus').textContent = ready ? 'Every row has a decision.' : 'Review every row before committing.';
  }
  async function reviewImportRow(rowId, decision) {
    const updated = await api(`/api/v1/imports/${currentImport.id}/rows/${rowId}`, 'PATCH', { decision });
    const row = currentImport.rows.find((entry) => entry.id === rowId); if (row) row.decision = decision;
    renderImportRows();
  }
  bindForm('importForm', async (values) => {
    const file = $('importForm').elements.file.files[0];
    if (!file) throw new Error('Choose a statement file');
    currentImport = await api('/api/v1/imports', 'POST', { fileName: file.name, content: await file.text(), accountId: values.accountId });
    $('importReview').hidden = false; renderImportRows(); status('Import preview ready. Review each row.', true);
  });
  $('commitImportButton').addEventListener('click', () => perform(async () => {
    const result = await api(`/api/v1/imports/${currentImport.id}/commit`, 'POST', {});
    $('importStatus').textContent = `Committed ${result.accepted} transaction(s); skipped ${result.skipped}.`;
    $('commitImportButton').disabled = true; $('cancelImportButton').disabled = true;
    await dashboard(); status('Import committed.', true);
  }));
  $('cancelImportButton').addEventListener('click', () => perform(async () => {
    if (currentImport) await api(`/api/v1/imports/${currentImport.id}/cancel`, 'POST', {});
    currentImport = null; $('importReview').hidden = true; $('importForm').reset(); status('Import cancelled.', true);
  }));

  async function profile() {
    show('profilePanel');
    const [profileData, sessionsData, mfa, passkeysData] = await Promise.all([
      api('/api/profile'), api('/api/settings/sessions'), api('/api/settings/mfa'), api('/api/settings/passkeys'),
    ]);
    $('profileEmail').textContent = profileData.email;
    $('profileForm').elements.displayName.value = profileData.displayName || '';
    const sessions = $('sessionList'); sessions.replaceChildren();
    for (const session of sessionsData.sessions) {
      const label = (session.userAgent || 'Unknown browser') + (session.current ? ' · Current session' : '') +
        ' · Last used ' + new Date(session.lastUsedAt).toLocaleString();
      item(sessions, label, button(session.current ? 'Sign out' : 'Revoke', async () => {
        await api('/api/settings/sessions/' + encodeURIComponent(session.id), 'DELETE');
        if (session.current) { show('authPanel'); status('Signed out.', true); }
        else { await profile(); status('Session revoked.', true); }
      }, session.current));
    }
    $('mfaStatus').textContent = mfa.enabled ? 'Enabled · ' + mfa.unusedRecoveryCodes + ' unused recovery codes' : 'Not enabled';
    $('startMfaButton').hidden = mfa.enabled;
    $('regenerateCodesButton').hidden = !mfa.enabled;
    $('disableMfaButton').hidden = !mfa.enabled;
    const passkeys = $('passkeyList'); passkeys.replaceChildren();
    for (const passkey of passkeysData.passkeys) {
      const actions = document.createElement('span');
      actions.append(button('Rename', async () => {
        const name = prompt('Passkey name', passkey.name);
        if (name === null) return;
        await api('/api/settings/passkeys/' + encodeURIComponent(passkey.id), 'PATCH', { name });
        await profile();
      }));
      actions.append(button('Remove', async () => {
        await api('/api/settings/passkeys/' + encodeURIComponent(passkey.id), 'DELETE');
        await settings();
      }, true));
      item(passkeys, passkey.name + ' · Added ' + new Date(passkey.createdAt).toLocaleDateString(), actions);
    }
  }

  async function settings() {
    show('settingsPanel');
    const languageData = await api('/api/settings/language');
    $('languageForm').elements.language.value = languageData.language;
    const householdData = await api('/api/settings/household'); householdCurrency = householdData.currency || householdCurrency; $('currencyForm').elements.currency.value = householdData.currency || 'USD'; $('currencyForm').elements.currencyName.value = householdData.currencyName || ''; $('currencyForm').elements.currencyIcon.value = householdData.currencyIcon || 'currency-dollar'; document.querySelectorAll('.currency-label').forEach((label) => { label.textContent = `(${householdCurrency})`; });
  }

  bindForm('reportForm', async (values) => { await loadReport(values.from, values.to); });
  bindForm('rulesForm', async (values) => { await api('/api/rules', 'PUT', { subscriptionReminders: values.subscriptionReminders === 'on', taskDueReminders: values.taskDueReminders === 'on', notifyBothPartners: values.notifyBothPartners === 'on', budgetWarningPercent: values.budgetWarningPercent ? Number(values.budgetWarningPercent) : null }); await rules(); status('Rules saved.', true); });
  bindForm('loginForm', passwordLogin);
  bindForm('inviteSignupForm', async (values) => {
    await api('/api/invitations/signup', 'POST', values);
    await checkAuth(); status('Account created and household joined.', true);
  });
  bindForm('mfaForm', async (values) => {
    await api('/api/auth/mfa', 'POST', values);
    $('passwordPanel').hidden = false; $('mfaPanel').hidden = true;
    await checkAuth(); status('Signed in.', true);
  });
  $('mfaBackButton').addEventListener('click', () => { $('mfaPanel').hidden = true; $('passwordPanel').hidden = false; status(''); });
  bindForm('householdForm', async (values) => { await api('/api/households', 'POST', values); await checkAuth(); status('Household created.', true); });
  bindForm('acceptInviteForm', async (values) => { await api('/api/invitations/accept', 'POST', values); await checkAuth(); status('Joined your household.', true); });
  bindForm('inviteForm', async (values) => {
    const invitation = await api('/api/invitations', 'POST', values);
    $('inviteLink').textContent = 'Share this link privately with your partner: ' + location.origin + '/?invite=' + encodeURIComponent(invitation.token);
    $('inviteRibbon').hidden = true; status('Invitation created. It expires in seven days.', true);
  });
  bindForm('accountForm', async (values) => { await api('/api/accounts', 'POST', values); closeNewItem(); await dashboard(); status('Account added.', true); });
  bindForm('transactionForm', async (values) => {
    if (values.type === 'transfer') values.sourceAccountId = values.accountId;
    await api(editingRecord ? `/api/transactions/${encodeURIComponent(editingRecord.id)}` : '/api/transactions', editingRecord ? 'PATCH' : 'POST', values);
    closeNewItem(); await dashboard(); status('Transaction recorded.', true);
  });
  $('transactionForm').elements.type.addEventListener('change', (event) => {
    const transfer = event.currentTarget.value === 'transfer';
    $('destinationField').hidden = !transfer;
    $('destinationAccounts').disabled = !transfer;
    $('destinationAccounts').required = transfer;
  });
  for (const [id, path, success] of [
    ['budgetForm', '/api/budgets', 'Budget proposed.'],
    ['goalForm', '/api/goals', 'Goal created.'],
    ['taskForm', '/api/tasks', 'Task created.'],
    ['subscriptionForm', '/api/subscriptions', 'Subscription added.'],
  ]) bindForm(id, async (values) => { const kind = path.split('/').pop(); const endpoint = editingRecord ? `${path}/${encodeURIComponent(editingRecord.id)}` : path; await api(endpoint, editingRecord ? 'PATCH' : 'POST', values); closeNewItem(); await dashboard(); status(editingRecord ? 'Record updated.' : success, true); });

  $('dashboardNav').addEventListener('click', () => perform(async () => { if (hasHousehold) { show('dashboardPanel'); await dashboard(); } else show('setupPanel'); }));
  $('reportsNav').addEventListener('click', () => perform(reports));
  $('profileNav').addEventListener('click', () => perform(profile));
  $('adminNav').addEventListener('click', () => perform(async () => { show('adminPanel'); await adminUsers(); }));
  $('settingsNav').addEventListener('click', () => perform(settings));
  $('rulesNav').addEventListener('click', () => perform(rules));
  $('logoutButton').addEventListener('click', () => perform(async () => { await api('/api/auth/logout', 'POST', {}); show('authPanel'); status('Signed out.', true); }));
  $('passwordChangeLogoutButton').addEventListener('click', () => perform(async () => { await api('/api/auth/logout', 'POST', {}); show('authPanel'); status('Signed out.', true); }));
  bindForm('passwordChangeForm', async (values) => { await api('/api/auth/change-password', 'POST', values); await checkAuth(); status('Password changed.', true); });
  bindForm('profileForm', async (values) => { await api('/api/profile', 'PATCH', values); await profile(); status('Profile saved.', true); });
  bindForm('profilePasswordForm', async (values) => { await api('/api/auth/change-password', 'POST', values); $('profilePasswordForm').reset(); status('Password changed.', true); });
  async function adminUsers() {
    const data = await api('/api/admin/users');
    const list = $('adminUserList'); list.replaceChildren();
    for (const user of data.users) item(list, (user.displayName || user.email) + ' · ' + user.email + (user.systemRole === 'root_admin' ? ' · administrator' : '') + (user.mustChangePassword ? ' · password change required' : '') + (user.disabledAt ? ' · disabled' : ''));
  }
  bindForm('adminUserForm', async (values) => { const result = await api('/api/admin/users', 'POST', values); $('adminUserResult').textContent = result.user.email + ' created. Share the temporary password securely; it must be changed at first login.'; await adminUsers(); });
  bindForm('languageForm', async (values) => { const result = await api('/api/settings/language', 'POST', values); applyLanguage(result.language); status('Language saved.', true); });
  bindForm('currencyForm', async (values) => { const result = await api('/api/settings/household', 'PATCH', { currency: values.currency.toUpperCase(), currencyName: values.currencyName, currencyIcon: values.currencyIcon }); householdCurrency = result.currency; status(`Currency saved as ${result.currencyName} (${result.currency}).`, true); await dashboard(); });
  bindForm('reauthForm', async (values) => { await api('/api/auth/reauthenticate', 'POST', values); status('Identity confirmed. You can now change sign-in methods.', true); });
  $('startMfaButton').addEventListener('click', () => perform(async () => {
    const result = await api('/api/settings/mfa/setup', 'POST', {});
    $('mfaSecret').textContent = new URL(result.otpauthUri).searchParams.get('secret') || '';
    $('mfaQrCode').src = result.qrCodeDataUrl;
    $('mfaSetup').hidden = false;
    status('Scan the QR code or enter the setup key, then enter a code.', true);
  }));
  bindForm('confirmMfaForm', async (values) => {
    const result = await api('/api/settings/mfa/confirm', 'POST', values);
    $('mfaSetup').hidden = true;
    $('mfaQrCode').removeAttribute('src');
    $('mfaSecret').textContent = '';
    $('recoveryCodes').textContent = result.recoveryCodes.join('\n');
    $('recoveryPanel').hidden = false;
    await profile(); status('MFA enabled. Save your recovery codes now.', true);
  });
  $('regenerateCodesButton').addEventListener('click', () => perform(async () => {
    const result = await api('/api/settings/mfa/recovery-codes', 'POST', {});
    $('recoveryCodes').textContent = result.recoveryCodes.join('\n');
    $('recoveryPanel').hidden = false;
    await profile(); status('Recovery codes replaced. Save the new codes now.', true);
  }));
  $('disableMfaButton').addEventListener('click', () => perform(async () => {
    await api('/api/settings/mfa', 'DELETE');
    $('recoveryPanel').hidden = true;
    await profile(); status('MFA disabled.', true);
  }));

  const passkeys = globalThis.SimpleWebAuthnBrowser;
  const supportsPasskeys = !!(passkeys && passkeys.browserSupportsPasskeys && passkeys.browserSupportsPasskeys());
  $('passkeyLoginButton').hidden = !supportsPasskeys;
  $('addPasskeyButton').hidden = !supportsPasskeys;
  $('passkeyReauthButton').hidden = !supportsPasskeys;
  $('passkeyLoginButton').addEventListener('click', () => perform(async () => {
    const begin = await api('/api/auth/passkey/login/options', 'POST', {});
    const response = await passkeys.startAuthentication({ optionsJSON: begin.options });
    await api('/api/auth/passkey/login/verify', 'POST', { response });
    await checkAuth(); status('Signed in with a passkey.', true);
  }));
  $('addPasskeyButton').addEventListener('click', () => perform(async () => {
    const name = $('passkeyName').value.trim();
    const begin = await api('/api/settings/passkeys/options', 'POST', {});
    const response = await passkeys.startRegistration({ optionsJSON: begin.options });
    await api('/api/settings/passkeys/verify', 'POST', { response, name });
    await profile(); status('Passkey added.', true);
  }));
  $('passkeyReauthButton').addEventListener('click', () => perform(async () => {
    const begin = await api('/api/auth/passkey/reauthenticate/options', 'POST', {});
    const response = await passkeys.startAuthentication({ optionsJSON: begin.options });
    await api('/api/auth/passkey/reauthenticate/verify', 'POST', { response });
    status('Identity confirmed. You can now change sign-in methods.', true);
  }));

  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) $('acceptInviteForm').elements.token.value = invite;
  perform(async () => {
    await checkAuth();
    if (invite && !$('authPanel').hidden) await prepareInvitation(invite);
  });
})();
