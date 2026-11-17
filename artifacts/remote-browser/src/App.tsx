import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type WheelEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleHelp, Copy,
  Globe2, KeyRound, LoaderCircle, LockKeyhole, Monitor, MousePointer2,
  Play, RefreshCw, ShieldCheck, Square, Wifi, WifiOff, X,
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
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#315e51',
    colorForeground: '#26343a',
    colorMutedForeground: '#6b7778',
    colorDanger: '#bd5148',
    colorBackground: '#fbf8f0',
    colorInput: '#fffdf8',
    colorInputForeground: '#26343a',
    colorNeutral: '#26343a',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8f0] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#ded9cd]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#26343a] font-semibold',
    headerSubtitle: 'text-[#6b7778]',
    socialButtonsBlockButtonText: 'text-[#26343a]',
    formFieldLabel: 'text-[#26343a]',
    footerActionLink: 'text-[#315e51]',
    footerActionText: 'text-[#6b7778]',
    dividerText: 'text-[#6b7778]',
    identityPreviewEditButton: 'text-[#315e51]',
    formFieldSuccessText: 'text-[#315e51]',
    alertText: 'text-[#26343a]',
    logoBox: 'rounded-lg',
    logoImage: 'rounded-lg',
    socialButtonsBlockButton: 'border border-[#ded9cd] bg-[#fffdf8]',
    formButtonPrimary: 'bg-[#315e51] hover:bg-[#264b40] text-[#fffaf0]',
    formFieldInput: 'bg-[#fffdf8] border-[#ded9cd] text-[#26343a]',
    footerAction: 'text-[#6b7778]',
    dividerLine: 'bg-[#ded9cd]',
    alert: 'border-[#e9c6bd] bg-[#fbf0eb]',
    otpCodeFieldInput: 'bg-[#fffdf8] border-[#ded9cd]',
    formFieldRow: 'text-[#26343a]',
    main: 'text-[#26343a]',
  },
};

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-xl bg-[#315e51] text-[#f6f2e7] ${small ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden="true">
      <LockKeyhole size={small ? 15 : 18} strokeWidth={1.7} />
    </span>
  );
}

function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/browser" />;
  return (
    <main className="grain min-h-[100dvh] overflow-hidden bg-[#f5f1e7] text-[#26343a]">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
        <a href="/" className="flex items-center gap-3" data-testid="link-home">
          <Mark />
          <span className="text-[15px] font-semibold tracking-[-.03em]">private browser</span>
        </a>
        <div className="flex items-center gap-5">
          <span className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#6b7778] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ca876c]" /> Personal by design
          </span>
          <a href="/sign-in" className="focus-ring rounded-full border border-[#d8d2c5] px-4 py-2 text-sm font-medium transition hover:bg-[#eae5d9]" data-testid="link-sign-in">Sign in <ArrowUpRight className="ml-1 inline" size={14} /></a>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-24 pt-14 md:min-h-[650px] md:grid-cols-[1.05fr_.95fr] md:px-10 md:pb-32 md:pt-16">
        <div className="page-enter relative z-10 max-w-[620px]">
          <p className="mb-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.19em] text-[#527366]">
            <span className="h-px w-7 bg-[#ca876c]" /> Your browser, at a distance
          </p>
          <h1 className="font-display text-[clamp(4rem,8vw,7.6rem)] leading-[.88] tracking-[-.045em]">
            Browse from<br /><em className="text-[#527366]">wherever.</em>
          </h1>
          <p className="mt-8 max-w-[430px] text-[16px] leading-7 text-[#627071]">
            A private window into Chromium on your own computer. Your machine makes the connection outward; nothing opens a door back in.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a href="/sign-up" className="focus-ring inline-flex items-center gap-3 rounded-full bg-[#315e51] px-6 py-3.5 text-sm font-semibold text-[#fbf8f0] transition hover:bg-[#264b40]" data-testid="link-create-account">
              Set up your private browser <ArrowRight size={16} />
            </a>
            <a href="#how-it-works" className="focus-ring rounded-full px-4 py-3 text-sm font-medium text-[#526264] transition hover:text-[#315e51]" data-testid="link-how-it-works">How it works</a>
          </div>
          <div className="mt-12 flex items-center gap-5 border-t border-[#ddd7cb] pt-5 text-[11px] uppercase tracking-[.12em] text-[#748080]">
            <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#527366]" /> Owner-only access</span>
            <span className="h-1 w-1 rounded-full bg-[#ca876c]" />
            <span>Outbound connection</span>
          </div>
        </div>

        <div className="page-enter relative mx-auto w-full max-w-[570px] md:justify-self-end" style={{ animationDelay: '100ms' }}>
          <div className="absolute -right-8 -top-10 h-64 w-64 rounded-full border border-[#ddd7c9]" />
          <div className="absolute -bottom-7 -left-8 h-44 w-44 rounded-full border border-[#ddd7c9]" />
          <div className="relative rounded-[24px] border border-[#d3cec1] bg-[#e9e4d9] p-3 shadow-[0_30px_80px_-45px_rgba(42,56,53,.38)]">
            <div className="overflow-hidden rounded-[16px] border border-[#d1ccbf] bg-[#faf8f1]">
              <div className="flex h-12 items-center gap-2 border-b border-[#e0dbcf] px-4">
                <span className="h-2 w-2 rounded-full bg-[#d7a18d]" /><span className="h-2 w-2 rounded-full bg-[#d6bd83]" /><span className="h-2 w-2 rounded-full bg-[#96aa91]" />
                <div className="ml-4 flex h-7 flex-1 items-center gap-2 rounded-md bg-[#eeeae0] px-3 text-[10px] text-[#87908d]"><LockKeyhole size={10} /> private session <span className="ml-auto font-mono">LOCAL / REMOTE</span></div>
              </div>
              <div className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden px-8 py-12 text-center">
                <div className="absolute left-8 top-10 h-28 w-28 rounded-full border border-[#e7e1d5]" />
                <div className="absolute bottom-8 right-7 h-44 w-44 rounded-full border border-[#e7e1d5]" />
                <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#dcd7ca] bg-[#f4f1e9] text-[#527366]"><Globe2 size={27} strokeWidth={1.25} /></div>
                <p className="relative font-display text-3xl text-[#26343a]">A familiar browser.</p>
                <p className="relative mt-2 max-w-[270px] text-xs leading-5 text-[#748080]">Running on your computer. Viewed securely from this one.</p>
                <div className="relative mt-7 flex items-center gap-2 rounded-full border border-[#ded9cd] bg-[#f7f4ec] px-3 py-2 text-[10px] text-[#6b7778]"><span className="h-1.5 w-1.5 rounded-full bg-[#ca876c]" /> Waiting for your computer to connect</div>
              </div>
              <div className="flex items-center justify-between border-t border-[#e0dbcf] px-4 py-3 text-[10px] text-[#7a8581]">
                <span className="flex items-center gap-2"><ShieldCheck size={13} /> Direct, private session</span><span className="font-mono">01 / 01</span>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 right-4 flex items-center gap-3 rounded-xl border border-[#ded9cd] bg-[#fbf8f0] px-4 py-3 shadow-[0_12px_36px_-24px_rgba(38,52,58,.45)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e6eee7] text-[#527366]"><Wifi size={15} /></span>
            <span><span className="block text-xs font-semibold">Your computer stays yours</span><span className="mt-0.5 block text-[10px] text-[#7b8582]">No inbound ports. No third-party pages.</span></span>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[#ded9cd] bg-[#ece8dd]">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-[.8fr_1.2fr] md:px-10 md:py-20">
          <div>
            <p className="text-[10px] uppercase tracking-[.18em] text-[#527366]">A small, deliberate system</p>
            <h2 className="mt-4 max-w-sm font-display text-4xl leading-[.98]">Your machine does the browsing.</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              ['01', 'Pair once', 'Generate a short-lived code and pair the computer you trust.'],
              ['02', 'Connect outward', 'The connector on your computer opens a secure outbound connection.'],
              ['03', 'Browse privately', 'Use its Chromium session here. Your computer is never exposed to the internet.'],
            ].map(([n, title, copy]) => <article key={n} data-testid={`step-${n}`} className="border-t border-[#cfc9bc] pt-4">
              <span className="font-mono text-xs text-[#bd8068]">{n}</span><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-2 max-w-[240px] text-sm leading-6 text-[#6b7778]">{copy}</p>
            </article>)}
          </div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 text-xs text-[#75807d] md:px-10">
        <span className="flex items-center gap-2"><Mark small /> private browser</span>
        <span>A personal tool. Nothing more.</span>
      </footer>
    </main>
  );
}

function AuthPage({ mode }: { mode: 'in' | 'up' }) {
  return (
    <main className="grain flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5f1e7] px-5 py-10">
      <a href="/" className="mb-8 flex items-center gap-3 text-sm font-semibold" data-testid="link-auth-home"><Mark /> private browser</a>
      <div className="w-full max-w-[440px] rounded-2xl border border-[#ded9cd] bg-[#fbf8f0] p-2 shadow-[0_25px_70px_-50px_rgba(38,52,58,.4)]">
        {mode === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}
      </div>
      <p className="mt-6 flex items-center gap-2 text-[11px] text-[#78827f]"><ShieldCheck size={14} /> Your session is private and owner-only.</p>
    </main>
  );
}

function StatusPill({ connected, children }: { connected: boolean; children: string }) {
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${connected ? 'bg-[#e4eee5] text-[#426d58]' : 'bg-[#f2e9df] text-[#98654f]'}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#558367]' : 'bg-[#c9876c]'}`} />{children}
  </span>;
}

function BrowserPage() {
  const queryClient = useQueryClient();
  const statusQuery = useGetBrowserStatus({ query: { queryKey: getGetBrowserStatusQueryKey(), refetchInterval: 6000 } });
  const pairing = useCreateBrowserPairing();
  const viewerTicket = useCreateBrowserViewerTicket();
  const stopSession = useStopBrowserSession();
  const { user } = useUser();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [socketState, setSocketState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [frame, setFrame] = useState<{ data: string; width: number; height: number } | null>(null);
  const [liveStatus, setLiveStatus] = useState<BrowserStatus | null>(null);
  const [urlInput, setUrlInput] = useState('');
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
    const target = /^https?:\/\//i.test(urlInput) ? urlInput : `https://${urlInput}`;
    send({ type: 'navigate', url: target });
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
  const displayName = user?.firstName || 'Owner';

  return (
    <main className="min-h-[100dvh] bg-[#f3f0e8] text-[#26343a]">
      <header className="flex h-[68px] items-center justify-between border-b border-[#ddd8cc] bg-[#f8f5ed] px-4 md:px-8">
        <a href="/browser" className="flex items-center gap-3" data-testid="link-browser-home"><Mark small /><span className="text-sm font-semibold tracking-[-.03em]">private browser</span><span className="ml-2 hidden h-4 border-l border-[#d7d1c5] sm:block" /><span className="hidden text-[11px] text-[#7a8581] sm:block">Personal workspace</span></a>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block"><div className="text-xs font-semibold">{displayName}</div><div className="text-[10px] text-[#7a8581]">Private owner</div></div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dfe8df] text-xs font-semibold text-[#315e51]" data-testid="text-owner-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[10px] font-medium uppercase tracking-[.17em] text-[#75817d]">Remote session / 01</p><h1 className="mt-2 font-display text-4xl tracking-[-.025em] md:text-5xl">Your browser</h1></div>
          <div className="flex items-center gap-2">
            <StatusPill connected={connected}>{connected ? 'Computer connected' : 'Computer offline'}</StatusPill>
            {browserOpen && <StatusPill connected={socketState === 'connected'}>{socketState === 'connected' ? 'Viewer live' : 'Browser open'}</StatusPill>}
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[#d9d4c8] bg-[#fbf9f3] shadow-[0_16px_50px_-42px_rgba(38,52,58,.45)]" aria-label="Remote browser controls">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e2ddd2] px-3 py-3 md:px-4">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => send({ type: 'back' })} disabled={!socket} className="focus-ring rounded-lg p-2 text-[#61706f] hover:bg-[#eeebe2] disabled:opacity-35" aria-label="Go back" data-testid="button-browser-back"><ArrowLeft size={17} /></button>
              <button type="button" onClick={() => send({ type: 'forward' })} disabled={!socket} className="focus-ring rounded-lg p-2 text-[#61706f] hover:bg-[#eeebe2] disabled:opacity-35" aria-label="Go forward" data-testid="button-browser-forward"><ArrowRight size={17} /></button>
              <button type="button" onClick={() => send({ type: 'reload' })} disabled={!socket} className="focus-ring rounded-lg p-2 text-[#61706f] hover:bg-[#eeebe2] disabled:opacity-35" aria-label="Reload page" data-testid="button-browser-reload"><RefreshCw size={15} /></button>
            </div>
            <form onSubmit={navigate} className="flex min-w-[180px] flex-1 items-center rounded-xl border border-[#e1dccf] bg-[#f4f1e9] px-3 focus-within:border-[#95aa9e]">
              <LockKeyhole size={13} className="shrink-0 text-[#668172]" />
              <input aria-label="Website address" data-testid="input-browser-url" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="Enter a website address" className="h-10 w-full bg-transparent px-2 text-xs text-[#39494c] outline-none placeholder:text-[#929b95]" />
              <button className="focus-ring rounded-md p-1.5 text-[#527366] hover:bg-[#e7e9df] disabled:opacity-35" disabled={!socket || !urlInput.trim()} aria-label="Navigate to address" data-testid="button-browser-navigate"><ArrowUpRight size={15} /></button>
            </form>
            <div className="ml-auto flex items-center gap-1">
              {browserOpen && <button type="button" onClick={stop} disabled={stopSession.isPending} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[#e5cfc7] px-3 py-2 text-xs font-medium text-[#a65a4d] hover:bg-[#f8ece7] disabled:opacity-50" data-testid="button-stop-session"><Square size={13} /> Stop</button>}
              {connected && socketState !== 'connected' && <button type="button" onClick={() => { viewerTicket.reset(); startViewer(); }} disabled={viewerTicket.isPending || socketState === 'connecting'} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[#315e51] px-3 py-2 text-xs font-semibold text-[#fffaf0] hover:bg-[#264b40] disabled:opacity-50" data-testid="button-open-browser"><Play size={13} /> {browserOpen ? 'Connect viewer' : 'Open browser'}</button>}
            </div>
          </div>
          <div className="relative min-h-[390px] bg-[#e6e3da] md:min-h-[560px]">
            {statusQuery.isLoading ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" data-testid="status-loading">
              <div className="h-10 w-64 animate-pulse rounded-lg bg-[#d8d6cc]" /><div className="h-3 w-40 animate-pulse rounded bg-[#d8d6cc]" /><span className="text-[11px] text-[#79837f]">Checking your computer…</span>
             </div> : statusQuery.isError ? <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" data-testid="status-error">
               <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f4e5df] text-[#a65a4d]"><WifiOff size={21} /></div><h2 className="font-display text-2xl">{isUnauthorized ? 'This account is not authorized.' : 'Status could not load'}</h2><p className="mt-2 max-w-sm text-sm text-[#77817d]">{isUnauthorized ? 'Sign in with the account approved for this private browser.' : 'The browser service did not respond. Try checking again.'}</p>{!isUnauthorized && <button type="button" onClick={() => statusQuery.refetch()} className="focus-ring mt-5 rounded-full border border-[#d5d0c4] px-4 py-2 text-xs font-semibold hover:bg-[#f4f1e9]" data-testid="button-retry-status">Try again</button>}
            </div> : !connected ? <div className="grid min-h-[390px] md:min-h-[560px] md:grid-cols-[1fr_.8fr]">
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center md:px-12">
                <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-[25px] border border-[#d7d3c8] bg-[#f0eee7] text-[#74817b]">
                  <Monitor size={31} strokeWidth={1.35} />
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#e6e3da] bg-[#cf9277] text-white"><X size={13} /></span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[.15em] text-[#9a715f]">Waiting for your computer</span>
                <h2 className="mt-4 font-display text-3xl md:text-4xl">No computer connected.</h2>
                <p className="mt-3 max-w-[390px] text-sm leading-6 text-[#74807d]">This is a remote view, not a proxy. Pair the computer that runs your Chromium browser, then its connector will establish a secure outbound connection.</p>
                <button type="button" onClick={createPairing} disabled={pairing.isPending} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[#315e51] px-5 py-3 text-sm font-semibold text-[#fffaf0] hover:bg-[#264b40] disabled:opacity-60" data-testid="button-create-pairing">
                  {pairing.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
                  {pairing.isPending ? 'Creating code…' : pairing.data ? 'Create a new pairing code' : 'Pair this computer'}
                </button>
                {pairing.isError && <p className="mt-3 text-xs text-[#a65a4d]" role="alert" data-testid="text-pairing-error">Could not create a pairing code. Please try again.</p>}
              </div>
              <aside className="border-t border-[#d8d4c9] bg-[#f1eee6] p-6 md:border-l md:border-t-0 md:p-9">
                <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#6e7c76]">Connect your computer</span><CircleHelp size={15} className="text-[#83908a]" /></div>
                {pairing.data ? <div className="mt-5 rounded-xl border border-[#d9d4c8] bg-[#fbf9f3] p-4" data-testid="panel-pairing-code">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[.12em] text-[#78827f]"><span>One-time pairing code</span><span>Expires {new Date(pairing.data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
                  <div className="mt-3 flex items-center justify-between gap-2"><code className="font-mono text-3xl font-medium tracking-[.17em] text-[#315e51]" data-testid="text-pairing-code">{pairing.data.code}</code><button type="button" onClick={copyCode} className="focus-ring flex items-center gap-1.5 rounded-lg border border-[#ded9cd] px-2.5 py-2 text-[11px] font-medium hover:bg-[#eeebe2]" data-testid="button-copy-pairing-code">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div>
                </div> : <div className="mt-5 flex min-h-[86px] items-center justify-center rounded-xl border border-dashed border-[#d4cfc3] text-xs text-[#8b9490]" data-testid="text-pairing-placeholder">Your pairing code will appear here.</div>}
                <ol className="mt-6 space-y-5">
                   <li className="flex gap-3"><span className="font-mono text-[11px] text-[#bd8068]">01</span><span><strong className="block text-xs font-semibold">Run the connector</strong><span className="mt-1 block text-xs leading-5 text-[#77827d]">Copy the <code>tools/browser-worker</code> folder to the computer that should run Chromium.</span></span></li>
                   <li className="flex gap-3"><span className="font-mono text-[11px] text-[#bd8068]">02</span><span><strong className="block text-xs font-semibold">Enter this code</strong><span className="mt-1 block text-xs leading-5 text-[#77827d]">Run the commands below there. The code is one-use and expires in five minutes.</span></span></li>
                  <li className="flex gap-3"><span className="font-mono text-[11px] text-[#bd8068]">03</span><span><strong className="block text-xs font-semibold">Keep it running</strong><span className="mt-1 block text-xs leading-5 text-[#77827d]">The connector initiates an encrypted outbound connection. No inbound port is exposed.</span></span></li>
                </ol>
                {pairing.data && <pre className="mt-5 overflow-x-auto rounded-xl bg-[#26343a] p-4 font-mono text-[10px] leading-5 text-[#f3f0e8]" data-testid="text-connector-command">{`npm install\nnpx playwright install chromium\nnode worker.mjs --server ${window.location.origin} --code ${pairing.data.code}`}</pre>}
                <div className="mt-7 flex items-start gap-2 border-t border-[#d9d4c8] pt-4 text-[10px] leading-4 text-[#77827d]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#527366]" /> Never share a pairing code. It can only be used once and expires automatically.</div>
              </aside>
            </div> : frame ? <div className="flex min-h-[390px] items-center justify-center bg-[#d7d5cc] p-2 md:min-h-[560px] md:p-4">
              <img ref={imageRef} src={frame.data} alt={currentStatus?.pageTitle || 'Remote Chromium browser view'} className="max-h-[calc(100dvh-210px)] max-w-full cursor-default select-none object-contain shadow-[0_16px_48px_-24px_rgba(20,30,30,.4)]" draggable={false} tabIndex={0} data-testid="img-browser-frame"
                onMouseMove={(event) => point(event, 'move')} onMouseDown={(event) => point(event, 'down')} onMouseUp={(event) => point(event, 'up')}
                onContextMenu={(event) => event.preventDefault()} onWheel={scroll}
                onKeyDown={(event) => {
                  if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) send({ type: 'text', text: event.key });
                  else if (event.key === 'Enter' || event.key.startsWith('Arrow') || event.key === 'Backspace' || event.key === 'Tab' || event.key === 'Escape' || event.key === 'Delete') send({ type: 'key', key: event.key });
                }} />
            </div> : <div className="flex min-h-[390px] flex-col items-center justify-center px-6 text-center md:min-h-[560px]" data-testid="browser-empty-view">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d4d0c5] bg-[#f3f0e8] text-[#658072]">{socketState === 'connecting' || viewerTicket.isPending ? <LoaderCircle size={23} className="animate-spin" /> : <Globe2 size={25} strokeWidth={1.4} />}</div>
              <h2 className="font-display text-3xl">{socketState === 'connecting' || viewerTicket.isPending ? 'Opening your session…' : 'Ready when you are.'}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#77827d]">{socketState === 'error' ? 'The browser connection could not be opened. Try opening the browser again.' : 'Your computer is paired. Open a private Chromium session to begin.'}</p>
              {socketState === 'error' && <button type="button" onClick={startViewer} className="focus-ring mt-5 rounded-full border border-[#d5d0c4] px-4 py-2 text-xs font-semibold hover:bg-[#f4f1e9]" data-testid="button-retry-viewer">Reconnect</button>}
            </div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2ddd2] px-4 py-3 text-[11px] text-[#7b8581]">
            <span className="flex max-w-full items-center gap-2 truncate" data-testid="text-page-title"><Globe2 size={13} className="shrink-0" />{currentStatus?.pageTitle || 'No page open'}</span>
            <span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><MousePointer2 size={13} /> Remote controls</span><span className="font-mono">{frame ? `${frame.width} × ${frame.height}` : '—'}</span></span>
          </div>
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#7e8884]">
          <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-[#527366]" /> Frames travel through your authenticated private session.</span>
          <span className="font-mono">CONNECTION: {connected ? 'OUTBOUND / SECURE' : 'NOT CONNECTED'}</span>
        </div>
      </div>
    </main>
  );
}

function SignOutButton() {
  const { signOut } = useClerk();
  return <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="focus-ring rounded-full border border-[#ddd8cc] px-3 py-1.5 text-[11px] font-medium text-[#687571] hover:bg-[#efede5]" data-testid="button-sign-out">Sign out</button>;
}

function ProtectedBrowser() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="min-h-[100dvh] animate-pulse bg-[#f3f0e8]" data-testid="auth-loading" />;
  return isSignedIn ? <BrowserPage /> : <Redirect to="/" />;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (prevUserId.current !== undefined && prevUserId.current !== userId) client.clear();
    prevUserId.current = userId;
  }), [addListener, client]);
  return null;
}

function ClerkRouter() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
      localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to open your private browser' } }, signUp: { start: { title: 'Create your private account', subtitle: 'Set up your personal browser workspace' } } }}
      routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/browser" component={ProtectedBrowser} />
          <Route path="/sign-in/*?" component={() => <AuthPage mode="in" />} />
          <Route path="/sign-up/*?" component={() => <AuthPage mode="up" />} />
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment.');
  return <WouterRouter base={basePath}><ClerkRouter /></WouterRouter>;
}

export default App;
