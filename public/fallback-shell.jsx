/* Minimal shell shown when the active theme fails to resolve, or when
   theme-loader.jsx couldn't run. Renders a usable error screen so the
   user can still reach Settings (via plain DOM) to fix the active theme. */

function FallbackShell(props) {
  const repos = props.repos || [];
  const allAgents = Object.values(props.agentsByRepo || {}).flat();
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 14, color: '#000', background: '#fff', minHeight: '100vh' }}>
      <h1 style={{ margin: '0 0 8px' }}>AOL — Fallback Mode</h1>
      <p style={{ color: '#a00' }}>
        {window.AOL_BOOT_ERROR || 'No theme could be loaded. The active theme is missing or invalid.'}
      </p>
      <p>
        Open a terminal and check the daemon logs, or browse to <code>/api/themes</code> to see the
        list of discovered themes and why each one is invalid. Update settings via:
      </p>
      <pre style={{ background: '#eee', padding: 8, fontSize: 12 }}>
{`curl -X POST http://127.0.0.1:3312/api/settings \\
  -H 'content-type: application/json' \\
  -d '{"theme.active":"aol"}'`}
      </pre>
      <hr style={{ margin: '16px 0' }} />
      <p style={{ fontSize: 12, color: '#444' }}>
        {repos.length} repos · {allAgents.length} agents · this is the unstyled fallback view.
      </p>
    </div>
  );
}

window.AOL_FALLBACK_SHELL = FallbackShell;
