import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type WheelEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy,
  Globe2, KeyRound, LoaderCircle, LockKeyhole, Monitor,
  Play, RefreshCw, ShieldCheck, Square, WifiOff,
} from 'lucide-react';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetBrowserStatusQueryKey,
  useCreateBrowserPairing,
  useCreateBrowserViewerTicket,
  useGetBrowserStatus,
  useStopBrowserSession,
} from '@workspace/api-client-react';
import type { BrowserStatus } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function resolveBrowserTarget(input: string): string {
  const address = input.trim();
  try {
    const explicitUrl = new URL(address);
    if (explicitUrl.protocol === 'http:' || explicitUrl.protocol === 'https:') {
      return explicitUrl.href;
    }
  } catch {
    // Inputs without a scheme are checked as hostnames below or searched.
  }

  if (!/\s/.test(address)) {
    try {
      const candidate = new URL(`https://${address}`);
      const hostname = candidate.hostname;
      if (
        hostname === 'localhost' ||
        hostname.includes('.') ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
      ) {
        if (hostname === 'localhost') candidate.protocol = 'http:';
        return candidate.href;
      }
    } catch {
      // Invalid host-like input is treated as a search phrase.
    }
  }

  return `https://www.google.com/search?q=${encodeURIComponent(address)}`;
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-md bg-[#202529] text-[#d5d9dc] ${small ? 'h-8 w-8' : 'h-9 w-9'}`} aria-hidden="true">
      <LockKeyhole size={small ? 15 : 18} strokeWidth={1.7} />
    </span>
  );
}

type BrowserAuthStatus = 'loading' | 'signed-in' | 'signed-out';

function useBrowserAuth(): BrowserAuthStatus {
  const [status, setStatus] = useState<BrowserAuthStatus>('loading');

  useEffect(() => {
    let active = true;
    fetch(`${basePath}/api/auth/session`, { credentials: 'same-origin' })
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`${basePath}/api/auth/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error || (response.status === 401 ? 'Invalid email or password.' : 'Sign-in failed. Try again.'));
        return;
      }
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
      {error && <p className="text-sm text-[#f08b83]" role="alert" data-testid="text-sign-in-error">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#d5d9dc] px-4 text-sm font-medium text-[#111416] hover:bg-[#c3c9cd] disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="button-password-sign-in"
      >
        {busy && <LoaderCircle size={15} className="animate-spin" />}
        Sign in
      </button>
    </form>
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
        <p className="mt-8 flex items-center gap-2 text-xs text-[#828c92]"><ShieldCheck size={14} /> Access is limited to the approved account.</p>
      </div>
    </main>
  );
}

function BrowserPage() {
  const queryClient = useQueryClient();
  const statusQuery = useGetBrowserStatus({ query: { queryKey: getGetBrowserStatusQueryKey(), refetchInterval: 6000 } });
  const pairing = useCreateBrowserPairing();
  const viewerTicket = useCreateBrowserViewerTicket();
  const stopSession = useStopBrowserSession();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [socketState, setSocketState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [frame, setFrame] = useState<{ data: string; width: number; height: number } | null>(null);
  const [liveStatus, setLiveStatus] = useState<BrowserStatus | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [navigationError, setNavigationError] = useState('');
  const [copied, setCopied] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastPointerAt = useRef(0);
  const currentStatus = liveStatus ?? statusQuery.data;
  const connected = currentStatus?.deviceConnected ?? false;
  const browserOpen = currentStatus?.browserOpen ?? false;
  const isUnauthorized =
    (statusQuery.error as { status?: number } | null)?.status === 403;

  useEffect(() => {
    if (!statusQuery.data) return;
    setLiveStatus(statusQuery.data);
    setUrlInput(statusQuery.data.currentUrl ?? '');
  }, [statusQuery.data]);

  useEffect(() => {
    const ticket = viewerTicket.data;
    if (!ticket) return;
    setSocketState('connecting');
    const raw = ticket.socketPath.startsWith('ws')
      ? ticket.socketPath
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${ticket.socketPath.startsWith('/') ? '' : '/'}${ticket.socketPath}`;
    const socketUrl = new URL(raw, window.location.href);
    socketUrl.searchParams.set('ticket', ticket.ticket);
    const ws = new WebSocket(socketUrl);
    setSocket(ws);
    ws.onopen = () => setSocketState('connected');
    ws.onclose = () => { setSocketState('idle'); setSocket(null); };
    ws.onerror = () => setSocketState('error');
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'status') {
          const next = {
            deviceConnected: Boolean(message.deviceConnected),
            browserOpen: Boolean(message.browserOpen),
            currentUrl: message.currentUrl ?? null,
            pageTitle: message.pageTitle ?? null,
          };
          setLiveStatus(next);
          setUrlInput(next.currentUrl ?? '');
          queryClient.setQueryData(getGetBrowserStatusQueryKey(), next);
        } else if (message.type === 'frame') {
          setFrame({ data: message.data, width: message.width, height: message.height });
        } else if (message.type === 'error') {
          setNavigationError('The browser could not open that page. Check the address or try a search.');
        }
      } catch {
        setSocketState('error');
      }
    };
    return () => { ws.close(); };
  }, [viewerTicket.data, queryClient]);

  useEffect(() => () => socket?.close(), [socket]);

  const send = (message: Record<string, unknown>) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const navigate = (event: FormEvent) => {
    event.preventDefault();
    const address = urlInput.trim();
    if (!address) return;
    if (socket?.readyState !== WebSocket.OPEN) {
      setNavigationError('Click Open browser first to start the remote session.');
      return;
    }
    setNavigationError('');
    send({ type: 'navigate', url: resolveBrowserTarget(address) });
  };
  const point = (event: MouseEvent<HTMLImageElement>, action: 'move' | 'down' | 'up') => {
    if (!imageRef.current || !frame) return;
    if (action === 'move') {
      const now = performance.now();
      if (now - lastPointerAt.current < 33) return;
      lastPointerAt.current = now;
    }
    const bounds = imageRef.current.getBoundingClientRect();
    send({
      type: 'pointer',
      x: Math.round((event.clientX - bounds.left) / bounds.width * frame.width),
      y: Math.round((event.clientY - bounds.top) / bounds.height * frame.height),
      action,
      button: event.button === 2 ? 'right' : 'left',
    });
  };
  const scroll = (event: WheelEvent<HTMLImageElement>) => {
    if (!imageRef.current || !frame) return;
    const bounds = imageRef.current.getBoundingClientRect();
    send({ type: 'scroll', x: Math.round((event.clientX - bounds.left) / bounds.width * frame.width), y: Math.round((event.clientY - bounds.top) / bounds.height * frame.height), deltaX: event.deltaX, deltaY: event.deltaY });
  };
  const createPairing = () => pairing.mutate(undefined);
  const startViewer = () => viewerTicket.mutate(undefined);
  const stop = () => stopSession.mutate(undefined, {
    onSuccess: () => {
      socket?.close();
      setSocket(null);
      setFrame(null);
      setLiveStatus((old) => old ? { ...old, browserOpen: false, currentUrl: null, pageTitle: null } : old);
      queryClient.invalidateQueries({ queryKey: getGetBrowserStatusQueryKey() });
    },
  });
  const copyCode = async () => {
    if (!pairing.data) return;
    await navigator.clipboard.writeText(pairing.data.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <main className="min-h-[100dvh] bg-[#0b0d0f] text-[#e8ecef]">
      <header className="flex h-12 items-center justify-between border-b border-[#252a2e] px-4">
        <a href="/browser" className="flex items-center gap-2.5 text-sm font-medium" data-testid="link-browser-home"><Mark small /> Private Browser</a>
        <SignOutButton />
      </header>
      <div className="p-2 sm:p-3">
        <section className="overflow-hidden rounded-md border border-[#292e32] bg-[#111416]" aria-label="Remote browser controls">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#292e32] p-2">
            <button type="button" onClick={() => send({ type: 'back' })} disabled={!socket} className="focus-ring rounded p-2 text-[#aeb6bb] hover:bg-[#202529] disabled:opacity-35" aria-label="Go back" data-testid="button-browser-back"><ArrowLeft size={16} /></button>
            <button type="button" onClick={() => send({ type: 'forward' })} disabled={!socket} className="focus-ring rounded p-2 text-[#aeb6bb] hover:bg-[#202529] disabled:opacity-35" aria-label="Go forward" data-testid="button-browser-forward"><ArrowRight size={16} /></button>
            <button type="button" onClick={() => send({ type: 'reload' })} disabled={!socket} className="focus-ring rounded p-2 text-[#aeb6bb] hover:bg-[#202529] disabled:opacity-35" aria-label="Reload page" data-testid="button-browser-reload"><RefreshCw size={14} /></button>
            <form onSubmit={navigate} className="flex min-w-[180px] flex-1 items-center rounded-md border border-[#30363a] bg-[#0b0d0f] px-3 focus-within:border-[#737d83]">
              <LockKeyhole size={13} className="shrink-0 text-[#828c92]" />
              <input aria-label="Search or enter a website address" data-testid="input-browser-url" value={urlInput} onChange={(event) => { setUrlInput(event.target.value); setNavigationError(''); }} placeholder="Search or enter a URL" className="h-9 w-full bg-transparent px-2 text-sm text-[#e8ecef] outline-none placeholder:text-[#737d83]" />
              <button className="focus-ring rounded p-1.5 text-[#c5cbd0] hover:bg-[#202529] disabled:opacity-35" disabled={!urlInput.trim()} aria-label="Search or go to address" data-testid="button-browser-navigate"><ArrowUpRight size={15} /></button>
            </form>
            {connected && socketState !== 'connected' && <button type="button" onClick={() => { viewerTicket.reset(); startViewer(); }} disabled={viewerTicket.isPending || socketState === 'connecting'} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-[#d5d9dc] px-3 text-xs font-medium text-[#111416] hover:bg-[#c3c9cd] disabled:opacity-50" data-testid="button-open-browser">
              {viewerTicket.isPending || socketState === 'connecting' ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={13} />}
              {browserOpen ? 'Reconnect' : 'Open browser'}
            </button>}
            {browserOpen && <button type="button" onClick={stop} disabled={stopSession.isPending} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-[#454043] px-3 text-xs font-medium text-[#d2a6a3] hover:bg-[#21191a] disabled:opacity-50" data-testid="button-stop-session"><Square size={12} /> Stop</button>}
          </div>
          {navigationError && <p className="border-b border-[#292e32] px-4 py-2 text-xs text-[#f08b83]" role="alert" data-testid="text-browser-navigation-error">{navigationError}</p>}
          <div className="relative flex min-h-[calc(100dvh-106px)] items-center justify-center bg-[#080a0c]">
            {statusQuery.isLoading ? <div className="flex flex-col items-center gap-3 text-sm text-[#9ba4aa]" data-testid="status-loading">
              <LoaderCircle size={20} className="animate-spin" /><span>Checking connection…</span>
            </div> : statusQuery.isError ? <div className="flex max-w-md flex-col items-center px-6 text-center" data-testid="status-error">
              <WifiOff size={20} className="mb-3 text-[#9ba4aa]" />
              <h2 className="text-base font-medium">{isUnauthorized ? 'This account is not authorized.' : 'Browser service unavailable'}</h2>
              <p className="mt-2 text-sm leading-6 text-[#9ba4aa]">{isUnauthorized ? 'Sign in with the approved account for this private browser.' : 'Check the browser service connection, then try again.'}</p>
              {!isUnauthorized && <button type="button" onClick={() => statusQuery.refetch()} className="focus-ring mt-4 rounded-md border border-[#343a3f] px-3 py-2 text-sm hover:bg-[#171b1e]" data-testid="button-retry-status">Try again</button>}
            </div> : !connected ? <div className="w-full max-w-xl px-5 py-10">
              <div className="flex items-center gap-2 text-sm text-[#9ba4aa]"><Monitor size={16} /> Computer not connected</div>
              <h1 className="mt-4 text-lg font-medium">Connect your computer</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#9ba4aa]">Download and extract the connector on the computer that should run Chromium. Generate a one-time code to pair it. The connector makes an outbound secure connection, so no tunnel or open port is needed.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={`${basePath}/browser-worker.zip`} download className="focus-ring inline-flex h-10 items-center rounded-md border border-[#343a3f] px-4 text-sm font-medium text-[#d5d9dc] hover:bg-[#171b1e]" data-testid="link-download-browser-worker">Download connector</a>
                <button type="button" onClick={createPairing} disabled={pairing.isPending} className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-[#d5d9dc] px-4 text-sm font-medium text-[#111416] hover:bg-[#c3c9cd] disabled:opacity-60" data-testid="button-create-pairing">
                  {pairing.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}
                  {pairing.isPending ? 'Generating code…' : pairing.data ? 'Generate another code' : 'Generate pairing code'}
                </button>
              </div>
              {pairing.isError && <p className="mt-3 text-sm text-[#f08b83]" role="alert" data-testid="text-pairing-error">Could not generate a pairing code. Try again.</p>}
              {pairing.data && <div className="mt-5 rounded-md border border-[#292e32] bg-[#111416] p-4" data-testid="panel-pairing-code">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#9ba4aa]">One-time code · expires {new Date(pairing.data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  <button type="button" onClick={copyCode} className="focus-ring inline-flex items-center gap-1.5 rounded border border-[#343a3f] px-2.5 py-1.5 text-xs text-[#d5d9dc] hover:bg-[#202529]" data-testid="button-copy-pairing-code">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>
                </div>
                <code className="mt-3 block font-mono text-2xl tracking-[.12em] text-[#e8ecef]" data-testid="text-pairing-code">{pairing.data.code}</code>
                <p className="mt-4 text-xs leading-5 text-[#9ba4aa]">Open a terminal in the extracted connector folder and run:</p>
                <pre className="mt-2 overflow-x-auto rounded bg-[#080a0c] p-3 font-mono text-xs leading-5 text-[#d5d9dc]" data-testid="text-connector-command">{`npm install\nnpx playwright install chromium\nnode worker.mjs --server ${window.location.origin} --code ${pairing.data.code}`}</pre>
                <p className="mt-3 text-xs text-[#828c92]">Keep the connector running. Never share this one-use code.</p>
              </div>}
            </div> : frame ? <div className="flex h-full min-h-[calc(100dvh-106px)] w-full items-center justify-center p-1 sm:p-2">
              <img ref={imageRef} src={frame.data} alt={currentStatus?.pageTitle || 'Remote Chromium browser view'} className="max-h-[calc(100dvh-112px)] max-w-full cursor-default select-none object-contain" draggable={false} tabIndex={0} data-testid="img-browser-frame"
                onMouseMove={(event) => point(event, 'move')} onMouseDown={(event) => point(event, 'down')} onMouseUp={(event) => point(event, 'up')}
                onContextMenu={(event) => event.preventDefault()} onWheel={scroll}
                onKeyDown={(event) => {
                  if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) send({ type: 'text', text: event.key });
                  else if (event.key === 'Enter' || event.key.startsWith('Arrow') || event.key === 'Backspace' || event.key === 'Tab' || event.key === 'Escape' || event.key === 'Delete') send({ type: 'key', key: event.key });
                }} />
            </div> : <div className="flex flex-col items-center px-6 text-center" data-testid="browser-empty-view">
              {socketState === 'connecting' || viewerTicket.isPending ? <LoaderCircle size={20} className="animate-spin text-[#aeb6bb]" /> : <Globe2 size={20} className="text-[#aeb6bb]" />}
              <h2 className="mt-3 text-sm font-medium">{socketState === 'connecting' || viewerTicket.isPending ? 'Opening browser…' : 'Computer connected'}</h2>
              <p className="mt-1 text-sm text-[#9ba4aa]">{socketState === 'error' ? 'The browser connection could not be opened.' : 'Open the browser session to begin.'}</p>
              {socketState === 'error' && <button type="button" onClick={startViewer} className="focus-ring mt-4 rounded-md border border-[#343a3f] px-3 py-2 text-sm hover:bg-[#171b1e]" data-testid="button-retry-viewer">Reconnect</button>}
            </div>}
          </div>
          <div className="flex min-h-9 items-center justify-between gap-3 border-t border-[#292e32] px-3 text-xs text-[#828c92]">
            <span className="flex min-w-0 items-center gap-2 truncate" data-testid="text-page-title"><Globe2 size={13} className="shrink-0" />{currentStatus?.pageTitle || 'No page open'}</span>
            <span className="shrink-0">{connected ? 'Computer connected' : 'Computer offline'}</span>
          </div>
        </section>
      </div>
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
      const response = await fetch(`${basePath}/api/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Could not sign out. Try again.');
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
