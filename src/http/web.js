(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let hasHousehold = false;

  function status(message, good = false) {
    $('status').textContent = message || '';
    $('status').style.color = good ? '#1d5b4a' : '#8c302e';
  }

  function show(panel) {
    for (const id of ['authPanel', 'passwordChangePanel', 'setupPanel', 'dashboardPanel', 'settingsPanel', 'adminPanel']) $(id).hidden = id !== panel;
    $('appNav').hidden = panel === 'authPanel';
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

  async function checkAuth() {
    try {
      const me = await api('/api/auth/me');
      hasHousehold = !!me.household;
      $('adminNav').hidden = me.systemRole !== 'root_admin';
      if (me.mustChangePassword) show('passwordChangePanel');
      else if (me.systemRole === 'root_admin') { show('adminPanel'); await adminUsers(); }
      else if (hasHousehold) { show('dashboardPanel'); await dashboard(); }
      else show('setupPanel');
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

  async function dashboard() {
    const data = await api('/api/dashboard');
    $('income').textContent = String(data.totals.householdIncome) + ' minor units';
    $('expense').textContent = String(data.totals.householdExpense) + ' minor units';
    const accounts = $('accountList'); accounts.replaceChildren();
    const entrants = $('entrantTotals'); entrants.replaceChildren();
    const audits = $('auditList'); audits.replaceChildren();
    for (const account of data.accounts) {
      item(accounts, account.name + ': ' + account.balance + (account.balance < 0 ? ' · negative balance' : ''));
    }
    for (const [userId, totals] of Object.entries(data.totals.byEntrant || {})) {
      item(entrants, userId + ' · income ' + totals.income + ', expenses ' + totals.expense);
    }
    for (const event of (data.audits || []).slice(-8).reverse()) {
      item(audits, event.action + ' · ' + event.entityType + ' · by ' + event.actorUserId);
    }
    for (const select of [$('accounts'), $('destinationAccounts')]) {
      select.replaceChildren();
      for (const account of data.accounts.filter((entry) => !entry.archived)) {
        const option = document.createElement('option');
        option.value = account.id; option.textContent = account.name;
        select.append(option);
      }
    }
  }

  async function settings() {
    show('settingsPanel');
    const [sessionsData, mfa, passkeysData] = await Promise.all([
      api('/api/settings/sessions'), api('/api/settings/mfa'), api('/api/settings/passkeys'),
    ]);
    const sessions = $('sessionList'); sessions.replaceChildren();
    for (const session of sessionsData.sessions) {
      const label = (session.userAgent || 'Unknown browser') + (session.current ? ' · Current session' : '') +
        ' · Last used ' + new Date(session.lastUsedAt).toLocaleString();
      item(sessions, label, button(session.current ? 'Sign out' : 'Revoke', async () => {
        await api('/api/settings/sessions/' + encodeURIComponent(session.id), 'DELETE');
        if (session.current) { show('authPanel'); status('Signed out.', true); }
        else { await settings(); status('Session revoked.', true); }
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
        await settings();
      }));
      actions.append(button('Remove', async () => {
        await api('/api/settings/passkeys/' + encodeURIComponent(passkey.id), 'DELETE');
        await settings();
      }, true));
      item(passkeys, passkey.name + ' · Added ' + new Date(passkey.createdAt).toLocaleDateString(), actions);
    }
  }

  bindForm('loginForm', passwordLogin);
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
  for (const [id, path, success] of [
    ['budgetForm', '/api/budgets', 'Budget proposed.'],
    ['goalForm', '/api/goals', 'Goal created.'],
    ['taskForm', '/api/tasks', 'Task created.'],
    ['subscriptionForm', '/api/subscriptions', 'Subscription added.'],
  ]) bindForm(id, async (values) => { await api(path, 'POST', values); status(success, true); });

  $('dashboardNav').addEventListener('click', () => perform(async () => { if (hasHousehold) { show('dashboardPanel'); await dashboard(); } else show('setupPanel'); }));
  $('adminNav').addEventListener('click', () => perform(async () => { show('adminPanel'); await adminUsers(); }));
  $('settingsNav').addEventListener('click', () => perform(settings));
  $('logoutButton').addEventListener('click', () => perform(async () => { await api('/api/auth/logout', 'POST', {}); show('authPanel'); status('Signed out.', true); }));
  $('passwordChangeLogoutButton').addEventListener('click', () => perform(async () => { await api('/api/auth/logout', 'POST', {}); show('authPanel'); status('Signed out.', true); }));
  bindForm('passwordChangeForm', async (values) => { await api('/api/auth/change-password', 'POST', values); await checkAuth(); status('Password changed.', true); });
  async function adminUsers() {
    const data = await api('/api/admin/users');
    const list = $('adminUserList'); list.replaceChildren();
    for (const user of data.users) item(list, user.email + (user.systemRole === 'root_admin' ? ' · administrator' : '') + (user.mustChangePassword ? ' · password change required' : '') + (user.disabledAt ? ' · disabled' : ''));
  }
  bindForm('adminUserForm', async (values) => { const result = await api('/api/admin/users', 'POST', values); $('adminUserResult').textContent = result.user.email + ' created. Share the temporary password securely; it must be changed at first login.'; await adminUsers(); });
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
    await settings(); status('MFA enabled. Save your recovery codes now.', true);
  });
  $('regenerateCodesButton').addEventListener('click', () => perform(async () => {
    const result = await api('/api/settings/mfa/recovery-codes', 'POST', {});
    $('recoveryCodes').textContent = result.recoveryCodes.join('\n');
    $('recoveryPanel').hidden = false;
    await settings(); status('Recovery codes replaced. Save the new codes now.', true);
  }));
  $('disableMfaButton').addEventListener('click', () => perform(async () => {
    await api('/api/settings/mfa', 'DELETE');
    $('recoveryPanel').hidden = true;
    await settings(); status('MFA disabled.', true);
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
    await settings(); status('Passkey added.', true);
  }));
  $('passkeyReauthButton').addEventListener('click', () => perform(async () => {
    const begin = await api('/api/auth/passkey/reauthenticate/options', 'POST', {});
    const response = await passkeys.startAuthentication({ optionsJSON: begin.options });
    await api('/api/auth/passkey/reauthenticate/verify', 'POST', { response });
    status('Identity confirmed. You can now change sign-in methods.', true);
  }));

  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) $('acceptInviteForm').elements.token.value = invite;
  perform(checkAuth);
})();
