import { buildReportFromData } from '../modules/reports/service';
import { randomUUID } from 'node:crypto';
import { PostgresHouseholdService } from '../modules/households/postgres-service';
import { IdentityService, RateLimitError } from '../modules/identity/service';
import { LedgerService } from '../modules/transactions/service';
import { PostgresTransactionService } from '../modules/transactions/postgres-service';
import { PlanningService } from '../modules/planning/service';
import { PostgresPlanningService } from '../modules/planning/postgres-service';
import { TaskSubscriptionService } from '../modules/tasks-subscriptions';
import { PostgresTaskSubscriptionService } from '../modules/tasks/postgres-service';
import { RulesService } from '../modules/rules';
import { NotificationService } from '../modules/notifications/service';
import { ImportService } from '../modules/imports/service';
import { HealthService } from '../modules/operations/health';
import { ApiV1Adapter } from './api-v1';
import type { HouseholdContext } from '../shared/household-context';
import type { DatabaseClient } from '../db/client';
import type { AppConfig } from '../config';
import { assertMutationAllowed, clearPendingCookie, clearSessionCookie, passkeyChallengeCookie, passkeyLoginToken, passkeyReauthenticationToken, passkeyRegistrationToken, pendingCookie, pendingToken, sessionCookie, sessionToken } from './auth-routes';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import QRCode from 'qrcode';
import { webAsset } from './web';

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extraHeaders } });

export class ApiApp {
  readonly households: PostgresHouseholdService;
  private readonly db: DatabaseClient;
  readonly identity: IdentityService;
  readonly ledger = new LedgerService();
  readonly postgresLedger: PostgresTransactionService;
  readonly planning = new PlanningService();
  readonly tasksSubscriptions = new TaskSubscriptionService();
  readonly postgresPlanning: PostgresPlanningService;
  readonly postgresTasks: PostgresTaskSubscriptionService;
  readonly rules: RulesService;
  readonly notifications: NotificationService;
  readonly imports: ImportService;
  readonly health: HealthService;
  readonly v1: ApiV1Adapter;

  constructor(db: DatabaseClient, private readonly config: AppConfig) {
    this.db = db;
    this.households = new PostgresHouseholdService(db);
    this.identity = new IdentityService(db, config);
    this.rules = new RulesService(db);
    this.notifications = new NotificationService(db);
    this.imports = new ImportService(db);
    this.health = new HealthService(db);
    this.postgresLedger = new PostgresTransactionService(db);
    this.v1 = new ApiV1Adapter(this.postgresLedger);
    this.postgresPlanning = new PostgresPlanningService(db);
    this.postgresTasks = new PostgresTaskSubscriptionService(db);
  }

  async fetch(request: Request, clientIp = ''): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true });
    if (request.method === 'GET' && url.pathname === '/api/ready') {
      const report = await this.health.readiness();
      return json(report, report.ready ? 200 : 503);
    }
    if (request.method === 'GET') {
      const asset = webAsset(url.pathname);
      if (asset) return asset;
    }
    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    try {
      assertMutationAllowed(request, this.config);
      if (request.method === 'POST' && url.pathname === '/api/auth/register') return json({ error: 'Account creation is invitation-only' }, 404);
      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await request.json() as Record<string, unknown>;
        const result = await this.identity.loginPassword(String(body.email ?? ''), String(body.password ?? ''), request.headers.get('user-agent') ?? '', clientIp);
        if (result.kind === 'mfa_required') {
          const response = json({ kind: 'mfa_required' });
          response.headers.set('set-cookie', pendingCookie(result.pendingToken, this.config));
          return response;
        }
        const response = json({ kind: 'session', session: result.issue.session });
        response.headers.set('set-cookie', sessionCookie(result.issue.token, this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/mfa') {
        const pending = pendingToken(request);
        if (!pending) return json({ error: 'Invalid code' }, 401);
        const body = await request.json() as Record<string, unknown>;
        const issue = await this.identity.completeMfa(pending, String(body.code ?? ''), request.headers.get('user-agent') ?? '');
        const response = json({ kind: 'session', session: issue.session });
        response.headers.append('set-cookie', sessionCookie(issue.token, this.config));
        response.headers.append('set-cookie', clearPendingCookie(this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/passkey/login/options') {
        const ceremony = await this.identity.beginPasskeyLogin();
        const response = json({ options: ceremony.options });
        response.headers.set('set-cookie', passkeyChallengeCookie('ourpot_passkey_login', ceremony.challengeToken, this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/passkey/login/verify') {
        const challenge = passkeyLoginToken(request);
        if (!challenge) return json({ error: 'Invalid passkey response' }, 401);
        const body = await request.json() as { response: AuthenticationResponseJSON };
        const issue = await this.identity.finishPasskeyLogin(challenge, body.response, request.headers.get('user-agent') ?? '', clientIp);
        const response = json({ kind: 'session', session: issue.session });
        response.headers.set('set-cookie', sessionCookie(issue.token, this.config));
        return response;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/invitations/')) {
        const invitationToken = decodeURIComponent(url.pathname.slice('/api/invitations/'.length));
        return json(await this.households.getInvitation(invitationToken));
      }
      if (request.method === 'POST' && url.pathname === '/api/invitations/signup') {
        const body = await request.json() as Record<string, unknown>;
        const user = await this.identity.createInvitedUser(String(body.token ?? ''), String(body.password ?? ''), String(body.displayName ?? ''), clientIp);
        const issue = await this.identity.issueSession(user.id, request.headers.get('user-agent') ?? '', 'password');
        const response = json({ kind: 'session', user }, 201);
        response.headers.set('set-cookie', sessionCookie(issue.token, this.config));
        return response;
      }
      const token = sessionToken(request);
      const principal = token ? await this.identity.getSession(token) : null;
      if (!principal) return json({ error: 'Authentication required' }, 401);
      if (request.method === 'GET' && url.pathname === '/api/auth/me') {
        return json({ userId: principal.userId, systemRole: principal.systemRole, mustChangePassword: principal.mustChangePassword, household: await this.households.findActiveHousehold(principal.userId) });
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        await this.identity.logout(token!);
        const response = json({ ok: true });
        response.headers.set('set-cookie', clearSessionCookie(this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/change-password') {
        const body = await request.json() as Record<string, unknown>;
        await this.identity.changePassword(principal, String(body.currentPassword ?? ''), String(body.newPassword ?? ''));
        return json({ ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/devices') {
        const body = await request.json() as Record<string, unknown>;
        const tokenValue = String(body.token ?? '').trim();
        const platform = String(body.platform ?? '');
        if (!tokenValue || !['web', 'android', 'ios'].includes(platform)) return json({ error: 'Invalid device token' }, 400);
        const result = await this.db.query<{ id: string }>('INSERT INTO device_push_tokens (id,user_id,platform,token) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,token) DO UPDATE SET revoked_at=NULL RETURNING id', [randomUUID(), principal.userId, platform, tokenValue]);
        return json({ id: result.rows[0]?.id }, 201);
      }
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/v1/devices/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/v1/devices/'.length));
        await this.db.query('UPDATE device_push_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2', [id, principal.userId]);
        return json({ ok: true });
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/notifications') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);
        const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
        return json(await this.notifications.listForUser(principal.userId, { limit, offset }));
      }
      if (request.method === 'POST' && url.pathname.startsWith('/api/v1/notifications/') && url.pathname.endsWith('/read')) {
        const id = decodeURIComponent(url.pathname.slice('/api/v1/notifications/'.length, -'/read'.length));
        await this.notifications.markRead(principal.userId, id);
        return json({ ok: true });
      }
      if (principal.mustChangePassword) return json({ error: 'Password change required' }, 403);
      if (request.method === 'GET' && url.pathname === '/api/profile') return json(await this.identity.getProfile(principal.userId));
      if (request.method === 'PATCH' && url.pathname === '/api/profile') {
        const body = await request.json() as Record<string, unknown>;
        return json(await this.identity.updateProfile(principal.userId, String(body.displayName ?? '')));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/users') {
        if (principal.systemRole !== 'root_admin') return json({ error: 'Administrator access required' }, 403);
        return json({ users: await this.identity.listManagedUsers() });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/users') {
        if (principal.systemRole !== 'root_admin') return json({ error: 'Administrator access required' }, 403);
        const body = await request.json() as Record<string, unknown>;
        return json({ user: await this.identity.createManagedUser(String(body.email ?? ''), String(body.temporaryPassword ?? ''), String(body.displayName ?? '')) }, 201);
      }
      if (request.method === 'GET' && url.pathname === '/api/settings/language') return json({ language: await this.identity.getLanguage(principal.userId) });
      if (request.method === 'POST' && url.pathname === '/api/settings/language') return json({ language: await this.identity.setLanguage(principal.userId, String((await request.json() as Record<string, unknown>).language ?? '')) });
      if (request.method === 'GET' && url.pathname === '/api/settings/household') { const context = await this.contextFrom(principal.userId); return json((await this.db.query('SELECT name,currency,currency_name AS "currencyName",currency_icon AS "currencyIcon" FROM households WHERE id=$1', [context.householdId])).rows[0]); }
      if (request.method === 'PATCH' && url.pathname === '/api/settings/household') { const context = await this.contextFrom(principal.userId); const body = await request.json() as Record<string, unknown>; const currency = String(body.currency ?? '').toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) return json({ error: 'Currency must be a three-letter code' }, 400); const result = await this.db.query('UPDATE households SET currency=$1,currency_name=$2,currency_icon=$3 WHERE id=$4 RETURNING name,currency,currency_name AS "currencyName",currency_icon AS "currencyIcon"', [currency, String(body.currencyName ?? ''), String(body.currencyIcon ?? 'currency-dollar'), context.householdId]); return json(result.rows[0]); }
      if (request.method === 'GET' && url.pathname === '/api/settings/sessions') {
        const sessions = await this.identity.listSessions(principal.userId);
        return json({ sessions: sessions.map((session) => ({ ...session, current: session.id === principal.sessionId })) });
      }
      if (request.method === 'GET' && url.pathname === '/api/settings/mfa') return json(await this.identity.mfaStatus(principal.userId));
      if (request.method === 'GET' && url.pathname === '/api/settings/passkeys') return json({ passkeys: await this.identity.listPasskeys(principal.userId) });
      if (request.method === 'POST' && url.pathname === '/api/settings/passkeys/options') {
        const ceremony = await this.identity.beginPasskeyRegistration(principal);
        const response = json({ options: ceremony.options });
        response.headers.set('set-cookie', passkeyChallengeCookie('ourpot_passkey_register', ceremony.challengeToken, this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/settings/passkeys/verify') {
        const challenge = passkeyRegistrationToken(request);
        if (!challenge) return json({ error: 'Invalid passkey response' }, 401);
        const body = await request.json() as { response: RegistrationResponseJSON; name: string };
        return json(await this.identity.finishPasskeyRegistration(principal, challenge, body.response, String(body.name ?? '')));
      }
      if (url.pathname.startsWith('/api/settings/passkeys/')) {
        const credentialId = decodeURIComponent(url.pathname.slice('/api/settings/passkeys/'.length));
        if (request.method === 'PATCH') {
          const body = await request.json() as { name: string };
          return json(await this.identity.renamePasskey(principal, credentialId, String(body.name ?? '')));
        }
        if (request.method === 'DELETE') {
          await this.identity.removePasskey(principal, credentialId);
          return json({ ok: true });
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/settings/mfa/setup') {
        const setup = await this.identity.startTotpEnrollment(principal);
        const qrCodeDataUrl = await QRCode.toDataURL(setup.otpauthUri, { errorCorrectionLevel: 'M', margin: 2, width: 240 });
        return json({ ...setup, qrCodeDataUrl });
      }
      if (request.method === 'POST' && url.pathname === '/api/settings/mfa/confirm') {
        const body = await request.json() as Record<string, unknown>;
        return json(await this.identity.confirmTotpEnrollment(principal, String(body.code ?? '')));
      }
      if (request.method === 'POST' && url.pathname === '/api/settings/mfa/recovery-codes') {
        return json({ recoveryCodes: await this.identity.regenerateRecoveryCodes(principal) });
      }
      if (request.method === 'DELETE' && url.pathname === '/api/settings/mfa') {
        await this.identity.disableTotp(principal);
        return json({ ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/reauthenticate') {
        const body = await request.json() as Record<string, unknown>;
        await this.identity.reauthenticatePassword(principal, String(body.password ?? ''), String(body.code ?? ''));
        return json({ ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/passkey/reauthenticate/options') {
        const ceremony = await this.identity.beginPasskeyReauthentication(principal);
        const response = json({ options: ceremony.options });
        response.headers.set('set-cookie', passkeyChallengeCookie('ourpot_passkey_reauth', ceremony.challengeToken, this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/passkey/reauthenticate/verify') {
        const challenge = passkeyReauthenticationToken(request);
        if (!challenge) return json({ error: 'Invalid passkey response' }, 401);
        const body = await request.json() as { response: AuthenticationResponseJSON };
        await this.identity.finishPasskeyReauthentication(principal, challenge, body.response);
        return json({ ok: true });
      }
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/settings/sessions/')) {
        const sessionId = url.pathname.slice('/api/settings/sessions/'.length);
        await this.identity.revokeSession(principal.userId, sessionId);
        const response = json({ ok: true });
        if (sessionId === principal.sessionId) response.headers.set('set-cookie', clearSessionCookie(this.config));
        return response;
      }
      if (request.method === 'POST' && url.pathname === '/api/households') {
        const body = await request.json() as Record<string, unknown>;
        const household = await this.households.createHousehold(principal.userId, {
          name: String(body.name ?? ''), currency: String(body.currency ?? ''), timezone: String(body.timezone ?? ''),
        });
        return json({ household }, 201);
      }
      if (request.method === 'POST' && url.pathname === '/api/invitations/accept') {
        const body = await request.json() as Record<string, unknown>;
        await this.households.acceptInvitation(String(body.token ?? ''), principal.userId);
        return json({ ok: true });
      }
      const context = await this.contextFrom(principal.userId);
      if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') return json(await this.v1.dashboard(context));
      if (request.method === 'GET' && url.pathname === '/api/v1/reports') {
        return json(await this.v1.report(context, url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? ''));
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/export') {
        const format = url.searchParams.get('format') ?? 'json';
        const content = await this.v1.export(context, format as 'json' | 'csv');
        return new Response(content, { headers: { 'cache-control': 'no-store', 'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="ourpot-export.${format}"` } });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/imports') {
        const body = await request.json() as Record<string, unknown>;
        return json(await this.imports.createBatch(context, {
          fileName: String(body.fileName ?? ''), content: String(body.content ?? ''), accountId: String(body.accountId ?? ''),
        }), 201);
      }
      const importRowRoute = url.pathname.match(/^\/api\/v1\/imports\/([^/]+)\/rows\/([^/]+)$/);
      if (request.method === 'PATCH' && importRowRoute) {
        const body = await request.json() as Record<string, unknown>;
        if (body.decision !== 'accept' && body.decision !== 'skip') throw new Error('Invalid import decision');
        return json(await this.imports.reviewRow(context, importRowRoute[1]!, importRowRoute[2]!, body.decision));
      }
      const importActionRoute = url.pathname.match(/^\/api\/v1\/imports\/([^/]+)\/(commit|cancel)$/);
      if (request.method === 'POST' && importActionRoute) {
        if (importActionRoute[2] === 'commit') return json(await this.imports.commitBatch(context, importActionRoute[1]!));
        await this.imports.cancelBatch(context, importActionRoute[1]!);
        return json({ ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/invitations') {
        const body = await request.json() as Record<string, unknown>;
        return json(await this.households.inviteMember(context, String(body.email ?? '')), 201);
      }
      if (request.method === 'GET' && url.pathname === '/api/rules') return json(await this.rules.get(context));
      if (request.method === 'PUT' && url.pathname === '/api/rules') return json(await this.rules.update(context, await request.json()));
      if (request.method === 'GET' && url.pathname === '/api/reports') {
        const financial = await this.postgresLedger.getDashboard(context);
        return json(buildReportFromData(await this.postgresLedger.listTransactions(context), financial.accounts, { from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' }));
      }
      if (request.method === 'GET' && url.pathname === '/api/dashboard') return this.dashboard(context);
      if (request.method === 'POST' && url.pathname === '/api/accounts') return this.createAccount(context, await request.json());
      const accountRoute = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if (accountRoute && request.method === 'PATCH') { const body = await request.json() as Record<string, unknown>; const result = await this.db.query('UPDATE accounts SET name=$1,type=$2,opening_balance=$3 WHERE id=$4 AND household_id=$5 RETURNING id', [String(body.name ?? ''), String(body.type ?? 'checking'), Number(body.openingBalance ?? 0), decodeURIComponent(accountRoute[1]!), context.householdId]); if (!result.rows[0]) return json({ error: 'Account not found' }, 404); return json({ ok: true }); }
      if (accountRoute && request.method === 'DELETE') { const result = await this.db.query('UPDATE accounts SET archived=true WHERE id=$1 AND household_id=$2 RETURNING id', [decodeURIComponent(accountRoute[1]!), context.householdId]); if (!result.rows[0]) return json({ error: 'Account not found' }, 404); return json({ ok: true }); }
      if (request.method === 'POST' && url.pathname === '/api/transactions') return this.createTransaction(context, await request.json());
      if (url.pathname.startsWith('/api/transactions/')) {
        const transactionId = decodeURIComponent(url.pathname.slice('/api/transactions/'.length));
        if (request.method === 'PATCH') return json(await this.postgresLedger.updateTransaction(context, transactionId, await request.json()));
        if (request.method === 'DELETE') { await this.postgresLedger.deleteTransaction(context, transactionId); return json({ ok: true }); }
      }
      const planningDelete = url.pathname.match(/^\/api\/(budgets|goals|tasks|subscriptions)\/([^/]+)$/);
      if (planningDelete && request.method === 'PATCH') {
        const key = planningDelete[1] as 'budgets' | 'goals' | 'tasks' | 'subscriptions'; const id = decodeURIComponent(planningDelete[2]!); const body = await request.json() as Record<string, unknown>;
        const updates = ({ budgets: [['amount_minor', Number(body.amount)], ['period', String(body.period ?? '')], ['rationale', String(body.rationale ?? '')]], goals: [['name', String(body.name ?? '')], ['target_amount_minor', Number(body.targetAmount)]], tasks: [['title', String(body.title ?? '')], ['due_date', String(body.dueDate ?? '')]], subscriptions: [['name', String(body.name ?? '')], ['price_minor', Number(body.price)], ['cadence', String(body.cadence ?? '')], ['next_renewal_date', String(body.nextRenewalDate ?? '')]] } as const)[key];
        const table = ({ budgets: 'budget_proposals', goals: 'savings_goals', tasks: 'financial_tasks', subscriptions: 'subscriptions' } as const)[key]; const set = updates.map(([column], index) => `${column}=$${index + 3}`).join(', '); const values = updates.map(([, value]) => value);
        const result = await this.db.query(`UPDATE ${table} SET ${set} WHERE id=$1 AND household_id=$2 RETURNING id`, [id, context.householdId, ...values]); if (!result.rows[0]) return json({ error: 'Record not found' }, 404); return json({ ok: true });
      }
      if (planningDelete && request.method === 'DELETE') {
        const key = planningDelete[1] as 'budgets' | 'goals' | 'tasks' | 'subscriptions';
        const table = ({ budgets: 'budget_proposals', goals: 'savings_goals', tasks: 'financial_tasks', subscriptions: 'subscriptions' } as const)[key];
        const result = await this.db.query(`DELETE FROM ${table} WHERE id=$1 AND household_id=$2 RETURNING id`, [decodeURIComponent(planningDelete[2]!), context.householdId]);
        if (!result.rows[0]) return json({ error: 'Record not found' }, 404);
        return json({ ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/budgets') return this.proposeBudget(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/budgets/discuss') return this.discussBudget(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/budgets/agree') return this.agreeBudget(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/goals') return this.createGoal(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/goals/contributions') return this.addContribution(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/tasks') return this.createTask(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/tasks/complete') return this.completeTask(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/subscriptions') return this.createSubscription(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/reminders') return json({ reminders: await this.postgresTasks.generateReminders(context, new Date()) });
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      const databaseCode = error && typeof error === 'object' && 'errno' in error ? String(error.errno) : null;
      if (databaseCode === '23505') return json({ error: 'Resource already exists' }, 409);
      if (databaseCode && /^[A-Z0-9]{5}$/.test(databaseCode)) return json({ error: 'Request failed' }, 500);
      if (message === 'Cross-origin request denied') return json({ error: message }, 403);
      if (message === 'Invalid credentials') return json({ error: message }, 401);
      if (message === 'Invalid code') return json({ error: message }, 401);
      if (message === 'Invalid passkey response') return json({ error: message }, 401);
      if (message === 'Recent authentication required') return json({ error: message }, 403);
      if (message === 'Household access denied' || message === 'Owner access required') return json({ error: message }, 403);
      if (message === 'Session not found') return json({ error: message }, 404);
      if (error instanceof RateLimitError) {
        const minutes = Math.floor(error.retryAfterSeconds / 60);
        const seconds = error.retryAfterSeconds % 60;
        const wait = minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}${seconds ? ` ${seconds} seconds` : ''}` : `${seconds} seconds`;
        return json({ error: `Too many attempts. Try again in about ${wait}.`, retryAfterSeconds: error.retryAfterSeconds }, 429, { 'retry-after': String(error.retryAfterSeconds) });
      }
      return json({ error: message }, 400);
    }
  }

  private async contextFrom(userId: string): Promise<HouseholdContext> {
    const membership = await this.households.findActiveHousehold(userId);
    if (!membership) throw new Error('Household access denied');
    return this.households.getContext(userId, membership.householdId);
  }

  private async dashboard(context: HouseholdContext): Promise<Response> {
    const members = await this.households.listMembers(context);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    const financial = await this.postgresLedger.getDashboard(context);
    const planning = await this.postgresPlanning.listDashboard(context);
    const tasks = await this.postgresTasks.listTasks(context);
    const subscriptions = await this.postgresTasks.listSubscriptions(context);
    const reminders = await this.postgresTasks.generateReminders(context, new Date());
    const transactions = await this.postgresLedger.listTransactions(context);
    const hasPendingInvitation = await this.households.hasPendingInvitation(context);
    const household = await this.db.query<{ currency: string }>('SELECT currency FROM households WHERE id=$1', [context.householdId]);
    return json({
      report: buildReportFromData(await this.postgresLedger.listTransactions(context), financial.accounts, { from: monthStart, to: today }),
      accounts: financial.accounts,
      totals: financial.totals,
      audits: financial.audits,
      members,
      budgets: planning.budgets,
      goals: planning.goals,
      wishes: planning.wishes,
      tasks,
      subscriptions,
      reminders,
      transactions: transactions.filter((transaction) => !transaction.deleted).slice(-12).reverse(),
      monthTransactions: transactions.filter((transaction) => !transaction.deleted && transaction.transactionDate.startsWith(monthStart.slice(0, 7))),
      hasPendingInvitation,
      currency: household.rows[0]?.currency ?? 'USD',
    });
  }

  private async createAccount(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresLedger.createAccount(context, { name: String(body.name ?? ''), type: body.type as 'checking', openingBalance: Number(body.openingBalance ?? 0) }));
  }

  private async createTransaction(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    const type = String(body.type ?? 'expense');
    const transactionDate = String(body.transactionDate ?? new Date().toISOString().slice(0, 10));
    if (type === 'transfer') return json(await this.postgresLedger.createTransfer(context, { sourceAccountId: String(body.sourceAccountId), destinationAccountId: String(body.destinationAccountId), amount: Number(body.amount), description: String(body.description ?? 'Transfer'), transactionDate }));
    const input = { accountId: String(body.accountId), amount: Number(body.amount), description: String(body.description ?? ''), category: String(body.category ?? ''), transactionDate };
    if (type === 'income') return json(await this.postgresLedger.createIncome(context, input));
    if (type === 'expense') return json(await this.postgresLedger.createExpense(context, input));
    return json({ error: 'Unsupported transaction type' }, 400);
  }

  private async proposeBudget(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresPlanning.proposeBudget(context, { category: String(body.category ?? ''), amount: Number(body.amount ?? 0), period: String(body.period ?? ''), rationale: String(body.rationale ?? '') }));
  }

  private async discussBudget(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresPlanning.discussBudget(context, String(body.budgetId)));
  }

  private async agreeBudget(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresPlanning.agreeBudget(context, String(body.budgetId)));
  }

  private async createGoal(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresPlanning.createGoal(context, { name: String(body.name ?? ''), targetAmount: Number(body.targetAmount ?? 0) }));
  }

  private async addContribution(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresPlanning.addContribution(context, String(body.goalId), { amount: Number(body.amount ?? 0), note: String(body.note ?? '') }));
  }

  private async createTask(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresTasks.createTask(context, { title: String(body.title ?? ''), assigneeId: String(body.assigneeId ?? context.userId), dueDate: String(body.dueDate ?? '') }));
  }

  private async completeTask(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresTasks.completeTask(context, String(body.taskId)));
  }

  private async createSubscription(context: HouseholdContext, body: Record<string, unknown>): Promise<Response> {
    return json(await this.postgresTasks.createSubscription(context, { name: String(body.name ?? ''), price: Number(body.price ?? 0), cadence: body.cadence as 'monthly' | 'yearly', nextRenewalDate: String(body.nextRenewalDate ?? '') }));
  }
}
