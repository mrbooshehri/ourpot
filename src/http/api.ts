import { PostgresHouseholdService } from '../modules/households/postgres-service';
import { IdentityService, RateLimitError } from '../modules/identity/service';
import { LedgerService } from '../modules/transactions/service';
import { PlanningService } from '../modules/planning/service';
import { TaskSubscriptionService } from '../modules/tasks-subscriptions';
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
  readonly identity: IdentityService;
  readonly ledger = new LedgerService();
  readonly planning = new PlanningService();
  readonly tasksSubscriptions = new TaskSubscriptionService();

  constructor(db: DatabaseClient, private readonly config: AppConfig) {
    this.households = new PostgresHouseholdService(db);
    this.identity = new IdentityService(db, config);
  }

  async fetch(request: Request, clientIp = ''): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true });
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
      if (principal.mustChangePassword) return json({ error: 'Password change required' }, 403);
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
      if (request.method === 'POST' && url.pathname === '/api/invitations') {
        const body = await request.json() as Record<string, unknown>;
        return json(await this.households.inviteMember(context, String(body.email ?? '')), 201);
      }
      if (request.method === 'GET' && url.pathname === '/api/dashboard') return this.dashboard(context);
      if (request.method === 'POST' && url.pathname === '/api/accounts') return this.createAccount(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/transactions') return this.createTransaction(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/budgets') return this.proposeBudget(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/budgets/discuss') return this.discussBudget(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/budgets/agree') return this.agreeBudget(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/goals') return this.createGoal(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/goals/contributions') return this.addContribution(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/tasks') return this.createTask(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/tasks/complete') return this.completeTask(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/subscriptions') return this.createSubscription(context, await request.json());
      if (request.method === 'POST' && url.pathname === '/api/reminders') return json({ reminders: this.tasksSubscriptions.generateReminders(context, new Date()) });
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
    const reminders = this.tasksSubscriptions.generateReminders(context, new Date());
    return json({
      accounts: this.ledger.listAccounts(context),
      totals: this.ledger.getTotals(context),
      audits: this.ledger.getAuditEvents(context),
      members,
      budgets: this.planning.listBudgets(context),
      goals: this.planning.listGoals(context),
      wishes: this.planning.listWishes(context),
      tasks: this.tasksSubscriptions.listTasks(context),
      subscriptions: this.tasksSubscriptions.listSubscriptions(context),
      reminders,
    });
  }

  private createAccount(context: HouseholdContext, body: Record<string, unknown>): Response {
    return json(this.ledger.createAccount(context, String(body.name ?? ''), body.type as 'checking', Number(body.openingBalance ?? 0)));
  }

  private createTransaction(context: HouseholdContext, body: Record<string, unknown>): Response {
    const type = String(body.type ?? 'expense');
    if (type === 'transfer') {
      return json(this.ledger.createTransfer(context, String(body.sourceAccountId), String(body.destinationAccountId), Number(body.amount), String(body.description ?? 'Transfer')));
    }
    const args = [context, String(body.accountId), Number(body.amount), String(body.description ?? ''), String(body.category ?? '')] as const;
    if (type === 'income') return json(this.ledger.createIncome(...args));
    if (type === 'adjustment') return json(this.ledger.createAdjustment(context, args[1], args[2], args[3]));
    return json(this.ledger.createExpense(...args));
  }

  private proposeBudget(context: HouseholdContext, body: Record<string, unknown>): Response {
    return json(this.planning.proposeBudget(context, String(body.category), Number(body.amount), String(body.period), String(body.rationale ?? '')));
  }

  private discussBudget(context: HouseholdContext, body: Record<string, unknown>): Response {
    this.planning.markDiscussed(context, String(body.budgetId));
    return json(this.planning.getBudget(String(body.budgetId)));
  }

  private agreeBudget(context: HouseholdContext, body: Record<string, unknown>): Response {
    this.planning.agreeBudget(context, String(body.budgetId));
    return json(this.planning.getBudget(String(body.budgetId)));
  }

  private createGoal(context: HouseholdContext, body: Record<string, unknown>): Response {
    return json(this.planning.createGoal(context, String(body.name), Number(body.targetAmount)));
  }

  private addContribution(context: HouseholdContext, body: Record<string, unknown>): Response {
    return json(this.planning.addContribution(context, String(body.goalId), Number(body.amount), String(body.note ?? '')));
  }

  private createTask(context: HouseholdContext, body: Record<string, unknown>): Response {
    return json(this.tasksSubscriptions.createTask(context, String(body.title), String(body.assigneeId ?? context.userId), String(body.dueDate)));
  }

  private completeTask(context: HouseholdContext, body: Record<string, unknown>): Response {
    this.tasksSubscriptions.completeTask(context, String(body.taskId));
    return json(this.tasksSubscriptions.getTask(String(body.taskId)));
  }

  private createSubscription(context: HouseholdContext, body: Record<string, unknown>): Response {
    return json(this.tasksSubscriptions.createSubscription(context, String(body.name), Number(body.price), body.cadence as 'monthly', String(body.nextRenewalDate)));
  }
}
