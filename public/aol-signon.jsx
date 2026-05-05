/* global React */
/*
  Sign-On + Connecting screens for Agents Online.
  Pair with signon.css. Plays connect.mp3 during the connecting stage.

  Usage:
    <SignOn onDone={({ name }) => ...} />

  Exposes window.AOL_SIGNON.{ SignOn, SignOnForm, ConnectingScreen }.
*/

const STAGES = [
  'Initializing modem...',
  'Dialing daemon at :3312...',
  'Negotiating MCP protocol...',
  'Subscribing to event stream...',
  'Loading buddy list...',
  'Welcome.',
];
const STAGE_MS = 280;
const FINAL_DELAY_MS = 1700;
const TOTAL_MS = STAGE_MS * STAGES.length + FINAL_DELAY_MS;

function ConnectTile({ src, alt, lit }) {
  if (!lit) return <div className="connect-tile" />;
  return (
    <div className="connect-tile">
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}

function ConnectingScreen({ progress, statusText, onCancel, logoSrc = 'agentsonlinelogo.png' }) {
  const lit1 = progress >= 25;
  const lit2 = progress >= 55;
  const lit3 = progress >= 85;
  return (
    <div className="signon-overlay">
      <div className="signon-connecting-window">
        <div className="signon-titlebar">Connecting To Agents Online...</div>
        <div className="signon-body">
          <div className="signon-connecting">
            <img src={logoSrc} className="connect-logo" alt="Agents Online" />
            <div className="connect-tiles">
              <ConnectTile src="connect1.jpg" alt="connect 1" lit={lit1} />
              <ConnectTile src="connect2.jpg" alt="connect 2" lit={lit2} />
              <ConnectTile src="connect3.jpg" alt="connect 3" lit={lit3} />
            </div>
            <div className="connect-baseline" style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                background: '#1f5378', width: progress + '%', transition: 'width 200ms linear'
              }} />
            </div>
            <div className="connect-status">{statusText}</div>
            <div style={{ fontSize: 11, color: '#666' }}>connecting at 56,000 bps</div>
            <button className="connect-cancel" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignOnForm({ onSubmit, screenName = 'observer', logoSrc = 'agentsonlinelogo.png' }) {
  return (
    <div className="signon-overlay">
      <div className="signon-window">
        <div className="signon-titlebar">Sign On</div>
        <div className="signon-body">
          <div className="signon-layout">
            <div className="signon-side">
              <img src={logoSrc} className="signon-logo" alt="Agents Online" />
              <div className="runner-corner">
                <span className="ver">version 4.0</span>
              </div>
            </div>
            <div className="signon-main">
              <div className="signon-fields">
                <div className="signon-field-block">
                  <label>Select Screen Name:</label>
                  <div className="locked-select" title="locked">
                    <span>{screenName}</span>
                    <span className="arrow">▼</span>
                  </div>
                </div>
                <div className="signon-field-block">
                  <label>Password:</label>
                  <div
                    className="locked-select"
                    title="locked"
                    style={{ background: '#fff', color: '#000', cursor: 'not-allowed' }}
                  >
                    <span style={{ letterSpacing: 2 }}>••••••••••</span>
                    <span className="arrow" style={{ visibility: 'hidden' }}>▼</span>
                  </div>
                </div>
              </div>
              <div className="signon-actions">
                <button className="signon-pillbtn primary" onClick={onSubmit}>SIGN ON</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignOn({ onDone, screenName = 'observer' }) {
  const [stage, setStage] = React.useState('form');
  const [progress, setProgress] = React.useState(0);
  const [text, setText] = React.useState(STAGES[0]);

  React.useEffect(() => {
    if (stage !== 'connecting') return;
    let audio = null;
    try {
      audio = new Audio('connect.mp3');
      audio.play().catch(() => {});
    } catch (e) {}
    let i = 0;
    setProgress(Math.round((1 / STAGES.length) * 100));
    setText(STAGES[0]);
    const t = setInterval(() => {
      i += 1;
      setProgress(Math.min(100, Math.round(((i + 1) / STAGES.length) * 100)));
      setText(STAGES[Math.min(i, STAGES.length - 1)]);
      if (i >= STAGES.length - 1) {
        clearInterval(t);
        setTimeout(() => {
          if (onDone) onDone({ name: screenName });
        }, FINAL_DELAY_MS);
      }
    }, STAGE_MS);
    return () => {
      clearInterval(t);
      if (audio) {
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
      }
    };
  }, [stage, onDone, screenName]);

  if (stage === 'connecting') {
    return (
      <ConnectingScreen
        progress={progress}
        statusText={text}
        onCancel={() => { setStage('form'); setProgress(0); setText(STAGES[0]); }}
      />
    );
  }
  return <SignOnForm onSubmit={() => setStage('connecting')} screenName={screenName} />;
}

window.AOL_SIGNON = { SignOn, SignOnForm, ConnectingScreen, TOTAL_MS };
