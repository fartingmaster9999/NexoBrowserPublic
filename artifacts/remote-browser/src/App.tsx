import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink, Globe2, LoaderCircle, Maximize2, Monitor, Play, ShieldCheck, WifiOff, X,
} from 'lucide-react';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetBrowserStatusQueryKey,
  useCreateBrowserViewerTicket,
  useGetBrowserStatus,
  useStopBrowserSession,
} from '@workspace/api-client-react';
import {
  browserApiUrl,
  browserAccessTokenExists,
  clearBrowserAccessToken,
  createBrowserSocketUrl,
  getBrowserAccessToken,
  getBrowserApiOrigin,
  isBrowserApiConfigured,
  saveBrowserAccessToken,
  setBrowserApiOrigin,
} from '@/lib/browserApi';
import { NoVncViewer } from '@/components/NoVncViewer';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${small ? 'h-8 w-8' : 'h-9 w-9'}`} aria-hidden="true">
      <img src="/brand-logo.png" alt="" className="h-full w-full object-contain" />
    </span>
  );
}

type BrowserAuthStatus = 'loading' | 'signed-in' | 'signed-out';

function useBrowserAuth(): BrowserAuthStatus {
  const [status, setStatus] = useState<BrowserAuthStatus>('loading');

  useEffect(() => {
    let active = true;
    if (!isBrowserApiConfigured()) {
      setStatus('signed-out');
      return () => { active = false; };
    }
    if (!browserAccessTokenExists()) {
      setStatus('signed-out');
      return () => { active = false; };
    }
    const token = getBrowserAccessToken();
    fetch(browserApiUrl('/api/auth/session'), {
      credentials: 'omit',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => {
        if (active) setStatus(response.ok ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (active) setStatus('signed-out');
      });
    return () => { active = false; };
  }, []);

  return status;
}

function Home() {
  const authStatus = useBrowserAuth();
  if (authStatus === 'loading') return <div className="min-h-[100dvh] bg-[#0b0d0f]" data-testid="auth-loading" />;
  if (authStatus === 'signed-in') return <Redirect to="/browser" />;
  return <AuthPage />;
}

function PasswordSignIn() {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const apiConfigured = isBrowserApiConfigured();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(browserApiUrl('/api/auth/login'), {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error || (response.status === 401 ? 'Invalid email or password.' : 'Sign-in failed. Try again.'));
        return;
      }
      const result = await response.json() as { accessToken?: string };
      if (!result.accessToken) throw new Error('The local browser service did not return a sign-in session.');
      saveBrowserAccessToken(result.accessToken);
      setPassword('');
      client.clear();
      setLocation('/browser');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-4" data-testid="form-password-sign-in">
      <label className="block text-sm text-[#d5d9dc]" htmlFor="owner-email">
        Email
        <input
          id="owner-email"
          autoComplete="username"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="focus-ring mt-2 h-11 w-full rounded-md border border-[#30363a] bg-[#111416] px-3 text-sm text-[#e8ecef] outline-none placeholder:text-[#737d83]"
          data-testid="input-owner-email"
        />
      </label>
      <label className="block text-sm text-[#d5d9dc]" htmlFor="owner-password">
        Password
        <input
          id="owner-password"
          autoComplete="current-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="focus-ring mt-2 h-11 w-full rounded-md border border-[#30363a] bg-[#111416] px-3 text-sm text-[#e8ecef] outline-none placeholder:text-[#737d83]"
          data-testid="input-owner-password"
        />
      </label>
      {!apiConfigured && <p className="text-sm text-[#f0c37b]" role="status">Set the local browser URL below before signing in.</p>}
      {error && <p className="text-sm text-[#f08b83]" role="alert" data-testid="text-sign-in-error">{error}</p>}
      <button
        type="submit"
        disabled={!apiConfigured || busy || !email.trim() || !password}
        className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#d5d9dc] px-4 text-sm font-medium text-[#111416] hover:bg-[#c3c9cd] disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="button-password-sign-in"
      >
        {busy && <LoaderCircle size={15} className="animate-spin" />}
        Sign in
      </button>
    </form>
  );
}

function LocalConnectionSettings() {
  const initialOrigin = getBrowserApiOrigin();
  const [expanded, setExpanded] = useState(!initialOrigin && !import.meta.env.DEV);
  const [origin, setOrigin] = useState(initialOrigin);
  const [error, setError] = useState('');

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      setBrowserApiOrigin(origin);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid HTTPS tunnel URL.');
    }
  };

  return (
    <section className="mt-8 border-t border-[#252a2e] pt-5" aria-label="Local browser connection settings">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="text-xs text-[#9ba4aa] underline underline-offset-4 hover:text-[#e8ecef]"
        data-testid="button-toggle-connection-settings"
      >
        {initialOrigin ? 'Change local browser connection' : 'Set up local browser connection'}
      </button>
      {expanded && <form onSubmit={save} className="mt-4 space-y-3">
        <label className="block text-sm text-[#d5d9dc]" htmlFor="browser-api-origin">
          Cloudflare Tunnel URL
          <input
            id="browser-api-origin"
            type="url"
            required
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="https://your-name.trycloudflare.com"
            className="focus-ring mt-2 h-11 w-full rounded-md border border-[#30363a] bg-[#111416] px-3 text-sm text-[#e8ecef] outline-none placeholder:text-[#737d83]"
            data-testid="input-browser-api-origin"
          />
        </label>
        {error && <p className="text-sm text-[#f08b83]" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={!origin.trim()}
          className="focus-ring h-10 rounded-md border border-[#343a3f] px-4 text-sm text-[#d5d9dc] hover:bg-[#171b1e] disabled:opacity-50"
          data-testid="button-save-connection"
        >
          Save connection
        </button>
        <p className="text-xs leading-5 text-[#828c92]">Paste the HTTPS address printed by the local Cloudflare Tunnel. It changes when a temporary tunnel is restarted.</p>
        <a href="/local-setup.html" className="inline-block text-xs text-[#9ba4aa] underline underline-offset-4 hover:text-[#e8ecef]">Read local setup instructions</a>
      </form>}
    </section>
  );
}

function AuthPage() {
  return (
    <main className="min-h-[100dvh] bg-[#0b0d0f] px-5 text-[#e8ecef]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col justify-center py-10">
        <a href="/" className="mb-8 flex items-center gap-2.5 text-sm font-medium" data-testid="link-auth-home"><Mark small /> Private Browser</a>
        <h1 className="text-xl font-medium tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-[#9ba4aa]">Use the email and password for your owner account.</p>
        <PasswordSignIn />
        <LocalConnectionSettings />
        <p className="mt-5 flex items-center gap-2 text-xs text-[#828c92]"><ShieldCheck size={14} /> Access is limited to the approved account.</p>
      </div>
    </main>
  );
}

function BrowserPage() {
  const queryClient = useQueryClient();
  const autoOpenViewerRef = useRef(new URLSearchParams(window.location.search).get('openRemoteBrowser') === '1');
  const statusQuery = useGetBrowserStatus({ query: { queryKey: getGetBrowserStatusQueryKey(), refetchInterval: 6000 } });
  const viewerTicket = useCreateBrowserViewerTicket();
  const stopSession = useStopBrowserSession();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerState, setViewerState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [viewerError, setViewerError] = useState('');
  const currentStatus = statusQuery.data;
  const connected = currentStatus?.deviceConnected ?? false;
  const browserOpen = currentStatus?.browserOpen ?? false;
  const isUnauthorized =
    [401, 403].includes((statusQuery.error as { status?: number } | null)?.status ?? 0);

  useEffect(() => {
    const ticket = viewerTicket.data;
    if (!ticket) return;
    setViewerUrl(createBrowserSocketUrl(ticket.socketPath, ticket.ticket));
    setViewerState('connecting');
  }, [viewerTicket.data]);

  const startViewer = () => {
    setViewerUrl('');
    viewerTicket.reset();
    viewerTicket.mutate(undefined);
  };
  const openViewer = () => {
    setViewerError('');
    setIsFullscreen(true);
    startViewer();
  };
  const toggleFullscreen = () => setIsFullscreen((current) => !current);
  const openNewWindow = () => {
    setViewerError('');
    const destination = new URL(window.location.href);
    destination.searchParams.set('openRemoteBrowser', '1');
    const newWindow = window.open(
      destination.toString(),
      '_blank',
      'popup,width=1280,height=900,toolbar=yes,location=yes,resizable=yes',
    );
    if (!newWindow) {
      setViewerError('Chrome blocked the new window. Allow pop-ups for this site, then try again.');
      return;
    }
    newWindow.focus();
  };
  useEffect(() => {
    if (!autoOpenViewerRef.current || !connected || viewerTicket.isPending) return;
    autoOpenViewerRef.current = false;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('openRemoteBrowser');
    window.history.replaceState({}, '', cleanUrl);
    openViewer();
  }, [connected, viewerTicket.isPending]);
  const stop = () => stopSession.mutate(undefined, {
    onSuccess: () => {
      setViewerUrl('');
      setViewerState('idle');
      queryClient.invalidateQueries({ queryKey: getGetBrowserStatusQueryKey() });
    },
  });
  const handleViewerState = useCallback((state: 'connecting' | 'connected' | 'error') => {
    setViewerState(state);
    if (state === 'connected') setViewerError('');
  }, []);
  const handleViewerError = useCallback((message: string) => {
    setViewerError(message);
  }, []);

  return (
    <main className={`${isFullscreen ? 'fixed inset-0 z-40 w-screen' : 'relative'} flex h-[100dvh] flex-col overflow-hidden bg-[#0b0d0f] text-[#e8ecef]`}>
      {!isFullscreen && <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#252a2e] px-4">
        <a href="/browser" className="flex items-center gap-2.5 text-sm font-medium" data-testid="link-browser-home"><Mark small /> Private Browser</a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNewWindow}
            className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-[#343a3f] px-2.5 text-xs text-[#d5d9dc] hover:bg-[#171b1e] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Open this browser in a new Chrome window"
            title="Open this browser in a new Chrome window"
            data-testid="button-new-chrome-window"
          >
            <ExternalLink size={14} />
            <span>New Chrome window</span>
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-[#343a3f] px-2.5 text-xs text-[#d5d9dc] hover:bg-[#171b1e]"
            aria-label="Enter fullscreen"
            title="Fullscreen"
            data-testid="button-fullscreen"
          >
            <Maximize2 size={14} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
          <SignOutButton />
        </div>
      </header>}
      {isFullscreen && <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={openNewWindow}
          className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-[#454a4f] bg-[#111416]/90 px-3 text-sm text-[#e8ecef] shadow-lg hover:bg-[#202529] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Open this browser in a new Chrome window"
          title="Open this browser in a new Chrome window"
          data-testid="button-new-chrome-window"
        >
          <ExternalLink size={16} />
          <span>New Chrome window</span>
        </button>
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#454a4f] bg-[#111416]/90 text-[#e8ecef] shadow-lg hover:bg-[#202529]"
          aria-label="Exit fullscreen"
          title="Exit fullscreen"
          data-testid="button-exit-fullscreen"
        >
          <X size={18} />
        </button>
      </div>}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#080a0c]" aria-label="Remote Chromium browser">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#080a0c]">
            {statusQuery.isLoading ? <div className="flex flex-col items-center gap-3 text-sm text-[#9ba4aa]" data-testid="status-loading">
              <LoaderCircle size={20} className="animate-spin" /><span>Checking local browser…</span>
            </div> : statusQuery.isError ? <div className="flex max-w-md flex-col items-center px-6 text-center" data-testid="status-error">
              <WifiOff size={20} className="mb-3 text-[#9ba4aa]" />
              <h2 className="text-base font-medium">{isUnauthorized ? 'This account is not authorized.' : 'Local browser service unavailable'}</h2>
              <p className="mt-2 text-sm leading-6 text-[#9ba4aa]">{isUnauthorized ? 'Sign in with the approved account for this private browser.' : 'Check that the local browser service and Cloudflare Tunnel are running.'}</p>
              {!isUnauthorized && <button type="button" onClick={() => statusQuery.refetch()} className="focus-ring mt-4 rounded-md border border-[#343a3f] px-3 py-2 text-sm hover:bg-[#171b1e]" data-testid="button-retry-status">Try again</button>}
            </div> : !connected ? <div className="w-full max-w-xl px-5 py-10">
              <div className="flex items-center gap-2 text-sm text-[#9ba4aa]"><Monitor size={16} /> Local computer offline</div>
              <h1 className="mt-4 text-lg font-medium">Start your local browser</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#9ba4aa]">Start the browser desktop and local service on your computer, then start the Cloudflare Tunnel. This page will connect directly to your computer instead of relaying the browser through Render.</p>
              <a href="/local-setup.html" className="focus-ring mt-5 inline-flex h-10 items-center rounded-md border border-[#343a3f] px-4 text-sm font-medium text-[#d5d9dc] hover:bg-[#171b1e]" data-testid="link-local-setup">Local setup instructions</a>
              {viewerError && <p className="mt-4 text-sm text-[#f08b83]" role="alert" data-testid="text-browser-viewer-error">{viewerError}</p>}
            </div> : viewerUrl ? <div className="absolute inset-0 h-full w-full" data-testid="browser-viewer-panel">
              <NoVncViewer url={viewerUrl} onState={handleViewerState} onError={handleViewerError} />
              {viewerError && <p className="absolute bottom-3 left-3 right-3 rounded bg-[#21191a]/95 px-3 py-2 text-sm text-[#f08b83]" role="alert" data-testid="text-browser-viewer-error">{viewerError}</p>}
            </div> : <div className="flex flex-col items-center px-6 text-center" data-testid="browser-empty-view">
              {viewerTicket.isPending || viewerState === 'connecting' ? <LoaderCircle size={20} className="animate-spin text-[#aeb6bb]" /> : <Globe2 size={20} className="text-[#aeb6bb]" />}
              <h2 className="mt-3 text-sm font-medium">{viewerState === 'error' ? 'Browser view disconnected' : 'Local Chromium is ready'}</h2>
              <p className="mt-1 text-sm text-[#9ba4aa]">{viewerState === 'error' ? 'Reconnect to the local browser display.' : 'Open your private Chromium desktop.'}</p>
              {(viewerError || viewerTicket.isError) && <p className="mt-3 max-w-lg text-sm leading-5 text-[#f08b83]" role="alert" data-testid="text-browser-viewer-error">
                {viewerError || (viewerTicket.error instanceof Error ? viewerTicket.error.message : 'Could not start the browser view. Try again.')}
              </p>}
              <button type="button" onClick={openViewer} disabled={viewerTicket.isPending} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-[#d5d9dc] px-4 py-2 text-sm font-medium text-[#111416] hover:bg-[#c3c9cd] disabled:opacity-50" data-testid="button-open-browser">
                {viewerTicket.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
                {viewerState === 'error' ? 'Reconnect' : 'Open browser'}
              </button>
            </div>}
          </div>
          {!isFullscreen && <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-[#292e32] px-3 text-xs text-[#828c92]">
            <span className="flex min-w-0 items-center gap-2 truncate" data-testid="text-page-title"><Globe2 size={13} className="shrink-0" />{currentStatus?.pageTitle || 'Chromium browser'}</span>
            <div className="flex items-center gap-3">
              {viewerUrl && <span>{viewerState === 'connected' ? 'Connected' : viewerState === 'error' ? 'Disconnected' : 'Connecting…'}</span>}
              {browserOpen && <button type="button" onClick={stop} disabled={stopSession.isPending} className="rounded border border-[#454043] px-2 py-1 text-[#d2a6a3] hover:bg-[#21191a] disabled:opacity-50" data-testid="button-stop-session">Disconnect</button>}
              <span className="shrink-0">{connected ? 'Local computer online' : 'Local computer offline'}</span>
            </div>
          </div>}
      </section>
    </main>
  );
}

function SignOutButton() {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      const token = getBrowserAccessToken();
      const response = await fetch(browserApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'omit',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error('Could not sign out. Try again.');
      clearBrowserAccessToken();
      client.clear();
      setLocation('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-[#f08b83]" role="alert">{error}</span>}
      <button type="button" onClick={signOut} disabled={busy} className="focus-ring rounded border border-[#30363a] px-3 py-1.5 text-xs font-medium text-[#aeb6bb] hover:bg-[#171b1e] disabled:opacity-60" data-testid="button-sign-out">
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

function ProtectedBrowser() {
  const authStatus = useBrowserAuth();
  if (authStatus === 'loading') return <div className="min-h-[100dvh] animate-pulse bg-[#0b0d0f]" data-testid="auth-loading" />;
  return authStatus === 'signed-in' ? <BrowserPage /> : <Redirect to="/" />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browser" component={ProtectedBrowser} />
      <Route path="/sign-in/*?" component={AuthPage} />
      <Route path="/sign-up/*?" component={() => <Redirect to="/" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
