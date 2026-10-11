(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let hasHousehold = false;
  let currentImport = null;

  function applyLanguage(language) {
    const locale = language === 'fa' || language === 'ar' ? language : 'en';
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'en' ? 'ltr' : 'rtl';
  }

  function status(message, good = false) {
    $('status').textContent = message || '';
    $('status').style.color = good ? '#1d5b4a' : '#8c302e';
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
    $('income').textContent = String(data.totals.householdIncome) + ' minor units';
    $('expense').textContent = String(data.totals.householdExpense) + ' minor units';
    $('netChange').textContent = String(data.totals.householdIncome - data.totals.householdExpense) + ' minor units';
    $('balance').textContent = String(data.accounts.reduce((total, account) => total + account.balance, 0)) + ' minor units';
    const accounts = $('accountList'); accounts.replaceChildren();
    const recentTransactions = $('recentTransactions'); recentTransactions.replaceChildren();
    const audits = $('auditList'); audits.replaceChildren();
    const memberNames = Object.fromEntries((data.members || []).map((member) => [member.userId, member.displayName]));
    for (const account of data.accounts) {
      const row = document.createElement('li');
      const name = document.createElement('span'); name.textContent = account.name + (account.balance < 0 ? ' · negative' : ''); if (account.balance < 0) name.className = 'negative-balance';
      const amount = document.createElement('strong'); amount.textContent = formatAmount(account.balance);
      row.append(name, amount); accounts.append(row);
    }
    for (const transaction of data.transactions || []) {
      const row = document.createElement('li');
      const icon = document.createElement('span'); icon.className = 'transaction-icon ' + (transaction.type === 'expense' ? 'expense' : ''); icon.textContent = transaction.type === 'expense' ? '−' : '+';
      const main = document.createElement('span'); main.className = 'transaction-main'; const title = document.createElement('strong'); title.textContent = transaction.description; const meta = document.createElement('small'); meta.textContent = `${transaction.transactionDate} · ${transaction.category || 'Uncategorized'}`; main.append(title, meta);
      const total = document.createElement('strong'); total.className = 'transaction-amount ' + (transaction.type === 'expense' ? 'expense' : ''); total.textContent = (transaction.type === 'expense' ? '-' : '+') + formatAmount(transaction.amount);
      row.append(icon, main, total); recentTransactions.append(row);
    }
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

  function formatAmount(value) { return Number(value).toLocaleString(document.documentElement.lang || 'en-US') + ' minor units'; }

  function renderDashboardVisuals(report) {
    const chart = $('dashboardChart'); chart.replaceChildren();
    if (!report || (!report.household.income && !report.household.expense)) { $('dashboardChartSummary').textContent = 'No income or expenses recorded this month.'; }
    else {
      const max = Math.max(report.household.income, report.household.expense, 1);
      for (const [label, value, color] of [['Income', report.household.income, '#1d5b4a'], ['Expenses', report.household.expense, '#a43e45']]) {
        const row = document.createElement('div'); row.className = 'chart-row'; const name = document.createElement('span'); name.textContent = label; const track = document.createElement('span'); track.className = 'chart-track'; const bar = document.createElement('span'); bar.className = 'chart-bar'; bar.style.inlineSize = (value / max * 100) + '%'; bar.style.backgroundColor = color; track.append(bar); const amount = document.createElement('strong'); amount.textContent = value + ' minor units'; row.append(name, track, amount); chart.append(row);
      }
      $('dashboardChartSummary').textContent = 'Net change: ' + report.household.net + ' minor units.';
    }
    const categories = $('dashboardCategoryList'); categories.replaceChildren(); const entries = Object.entries(report?.byCategory || {}); if (!entries.length) item(categories, 'No expenses by category yet.'); for (const [category, amount] of entries) item(categories, category + ' · ' + amount + ' minor units');
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
        const amount = document.createElement('strong'); amount.textContent = `${value} minor units`;
        row.append(name, amount); values.append(row);
      }
      article.append(values); container.append(article);
    }
  }

  function renderPlanning(data, memberNames) {
    const budgets = $('budgetList'); budgets.replaceChildren();
    for (const budget of data.budgets || []) item(budgets, `${budget.category} · ${budget.amount} · ${budget.period} · ${budget.status} · proposed by ${memberNames[budget.proposerId] || 'Household member'}`);
    const goals = $('goalList'); goals.replaceChildren();
    for (const goal of data.goals || []) item(goals, `${goal.name} · ${goal.contributedAmount}/${goal.targetAmount} · ${goal.status}`);
    const tasks = $('taskList'); tasks.replaceChildren();
    for (const task of data.tasks || []) item(tasks, `${task.title} · due ${task.dueDate} · assigned to ${memberNames[task.assigneeId] || 'Household member'} · ${task.status}`);
    const subscriptions = $('subscriptionList'); subscriptions.replaceChildren();
    for (const subscription of data.subscriptions || []) item(subscriptions, `${subscription.name} · ${subscription.price} · renews ${subscription.nextRenewalDate}`);
    const reminders = $('reminderList'); reminders.replaceChildren();
    for (const reminder of data.reminders || []) item(reminders, `Reminder · renewal ${reminder.renewalDate} · ${reminder.leadDays} days before`);
  }

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
    $('reportIncome').textContent = data.household.income + ' minor units';
    $('reportExpense').textContent = data.household.expense + ' minor units';
    $('reportNet').textContent = data.household.net + ' minor units';
    const categories = $('reportCategories'); categories.replaceChildren();
    const categoryEntries = Object.entries(data.byCategory);
    if (!categoryEntries.length) item(categories, 'No expenses in this range.');
    for (const [category, amount] of categoryEntries) item(categories, category + ' · ' + amount + ' minor units');
    const monthly = $('reportMonthly'); monthly.replaceChildren();
    if (!data.monthly.length) item(monthly, 'No income or expenses in this range.');
    for (const row of data.monthly) item(monthly, row.month + ' · income ' + row.income + ' · expenses ' + row.expense + ' · net ' + row.net);
    $('reportStatus').textContent = 'Showing ' + data.range.from + ' through ' + data.range.to + '.';
  }

  function renderImportRows() {
    const list = $('importRows'); list.replaceChildren();
    for (const row of currentImport.rows) {
      const label = `${row.transactionDate} · ${row.type} · ${row.amountMinor} minor units · ${row.description}${row.duplicateOf ? ' · duplicate in file' : ''}`;
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
    status('Invitation created. It expires in seven days.', true);
  });
  bindForm('accountForm', async (values) => { await api('/api/accounts', 'POST', values); await dashboard(); status('Account added.', true); });
  bindForm('transactionForm', async (values) => {
    if (values.type === 'transfer') values.sourceAccountId = values.accountId;
    await api('/api/transactions', 'POST', values);
    await dashboard(); status('Transaction recorded.', true);
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
  ]) bindForm(id, async (values) => { await api(path, 'POST', values); await dashboard(); status(success, true); });

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
