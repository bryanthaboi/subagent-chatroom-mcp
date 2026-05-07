/* global React */
/* AOL Classic Shell — multi-window desktop layout.
   Receives the controller props from aol-app.jsx and composes the building
   blocks from window.AOL_WINDOWS into draggable Win-chrome.

   This file is a *theme*. To swap layouts entirely (e.g. a single-window
   theme), copy this file into your theme dir and reshape the JSX. The
   inner panels (BuddyList, ChatRoom, ...) stay stock. */

const { Win, Icon, devlog } = window.AOL_DATA;
const { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About, Settings: SettingsPanel } =
  window.AOL_WINDOWS;

function Shell(props) {
  const {
    observer, repos, agentsByRepo, claims, activity, messagesByRepo, dms,
    settings, themes,
    sendRoom, sendDM, openChatForRepo, loadDM, forceRelease, deleteAgent, hideRepo, setSettings,
    windows, chatWindows, dmWindows,
    openWin, closeWin, activateWin, closeChat, closeDM,
    activeWin,
    filesScope, setFilesScope, logScope, setLogScope,
    errorBanner, dismissError,
  } = props;

  const [chatPickerOpen, setChatPickerOpen] = React.useState(false);
  devlog('shell', 'render', { observer: observer.name, repos: repos.length, activeTheme: settings?.['theme.active'] });

  const dmListFor = (id) => (dms[id] || []).slice().sort((a, b) => a.ts - b.ts);
  const allAgents = Object.values(agentsByRepo).flat();

  return (
    <>
      <div className="desktop">
        {/* Desktop icons */}
        <div className="desk-icon" style={{ left: 16, top: 16 }} onDoubleClick={() => openWin('buddies')}>
          <div className="icon-img" style={{ background: '#ffd700', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏃</div>
          Buddy List
        </div>
        <div className="desk-icon" style={{ left: 16, top: 110 }} onDoubleClick={() => setChatPickerOpen(true)}>
          <div className="icon-img" style={{ background: '#fff', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>💬</div>
          Chat Rooms
        </div>
        <div className="desk-icon" style={{ left: 16, top: 204 }} onDoubleClick={() => openWin('files')}>
          <div className="icon-img" style={{ background: '#fff', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📁</div>
          File Targets
        </div>
        <div className="desk-icon" style={{ left: 16, top: 298 }} onDoubleClick={() => openWin('log')}>
          <div className="icon-img" style={{ background: '#000', border: '2px solid #000', color: '#0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14 }}>{'>_'}</div>
          Activity
        </div>
        <div className="desk-icon" style={{ left: 16, top: 392 }} onDoubleClick={() => openWin('settings')}>
          <div className="icon-img" style={{ background: '#c3c3c3', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚙</div>
          Settings
        </div>
        <div className="desk-icon" style={{ left: 16, top: 486 }} onDoubleClick={() => openWin('about')}>
          <div className="icon-img" style={{ background: '#0000a0', border: '2px solid #000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontWeight: 'bold' }}>i</div>
          About AOL
        </div>

        {/* Buddy list */}
        {windows.buddies?.open && (
          <div style={{ zIndex: windows.buddies.z, position: 'absolute' }}>
            <Win id="buddies" title={windows.buddies.title} icon={Icon.buddies}
                 x={windows.buddies.x} y={windows.buddies.y} w={windows.buddies.w} h={windows.buddies.h}
                 active={activeWin === 'buddies'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 240, h: 320 }}>
              <BuddyList
                repos={repos}
                agentsByRepo={agentsByRepo}
                observerName={observer.name}
                onOpenChatForRepo={openChatForRepo}
                onOpenDM={loadDM}
                onOpenChatPicker={() => setChatPickerOpen(true)}
                onOpenFiles={() => openWin('files')}
                onOpenLog={() => openWin('log')}
                onOpenAbout={() => openWin('about')}
                onDelete={deleteAgent}
                onHideRepo={hideRepo}
              />
            </Win>
          </div>
        )}

        {/* Per-repo chat windows */}
        {Object.entries(chatWindows).map(([repoPath, ws]) => ws.open && (
          <div key={'chat:' + repoPath} style={{ zIndex: ws.z, position: 'absolute' }}>
            <Win id={'chat:' + repoPath}
                 title={'Chat — ' + (repos.find((r) => r.repoPath === repoPath)?.basename ?? '')}
                 icon={Icon.chat}
                 x={ws.x} y={ws.y} w={ws.w} h={ws.h}
                 active={activeWin === 'chat:' + repoPath} onActivate={activateWin}
                 onClose={() => closeChat(repoPath)}
                 minSize={{ w: 360, h: 280 }}>
              <ChatRoom
                repo={repos.find((r) => r.repoPath === repoPath)}
                messages={messagesByRepo[repoPath] || []}
                agentCount={(agentsByRepo[repoPath] || []).filter((a) => a.status !== 'offline' && a.status !== 'away').length}
                onSend={(body) => sendRoom(repoPath, body)}
                observerName={observer.name}
                observerId={observer.id}
                repoPath={repoPath}
              />
            </Win>
          </div>
        ))}

        {/* Files */}
        {windows.files?.open && (
          <div style={{ zIndex: windows.files.z, position: 'absolute' }}>
            <Win id="files" title={windows.files.title} icon={Icon.files}
                 x={windows.files.x} y={windows.files.y} w={windows.files.w} h={windows.files.h}
                 active={activeWin === 'files'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 480, h: 200 }}>
              <FileTargets
                claims={claims}
                repos={repos}
                scope={filesScope}
                onScopeChange={setFilesScope}
                onMessage={(claim) => {
                  const a = allAgents.find((x) => x.id === claim.agentId);
                  if (a) loadDM(a);
                }}
                onForceRelease={forceRelease}
              />
            </Win>
          </div>
        )}

        {/* Activity */}
        {windows.log?.open && (
          <div style={{ zIndex: windows.log.z, position: 'absolute' }}>
            <Win id="log" title={windows.log.title} icon={Icon.log}
                 x={windows.log.x} y={windows.log.y} w={windows.log.w} h={windows.log.h}
                 active={activeWin === 'log'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 240 }}>
              <ActivityLog events={activity} repos={repos} scope={logScope} onScopeChange={setLogScope} agents={allAgents} />
            </Win>
          </div>
        )}

        {/* Settings */}
        {windows.settings?.open && (
          <div style={{ zIndex: windows.settings.z, position: 'absolute' }}>
            <Win id="settings" title="Settings" icon={Icon.about}
                 x={windows.settings.x} y={windows.settings.y} w={windows.settings.w} h={windows.settings.h}
                 active={activeWin === 'settings'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 280 }}>
              {SettingsPanel
                ? <SettingsPanel settings={settings} themes={themes} onChange={setSettings} />
                : <div style={{ padding: 12, fontSize: 12 }}>Settings panel not loaded.</div>}
            </Win>
          </div>
        )}

        {/* About */}
        {windows.about?.open && (
          <div style={{ zIndex: windows.about.z, position: 'absolute' }}>
            <Win id="about" title={windows.about.title} icon={Icon.about}
                 x={windows.about.x} y={windows.about.y} w={windows.about.w} h={windows.about.h}
                 active={activeWin === 'about'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 360 }}>
              <About port={window.location.port || '3312'} />
            </Win>
          </div>
        )}

        {/* DM popup windows */}
        {Object.entries(dmWindows).map(([id, ws]) => {
          if (!ws.open) return null;
          const agent = allAgents.find((a) => a.id === id);
          if (!agent) return null;
          return (
            <div key={'dm:' + id} style={{ zIndex: ws.z, position: 'absolute' }}>
              <Win id={'dm:' + id} title={`IM with ${agent.name}`} icon={Icon.dm}
                   x={ws.x} y={ws.y} w={ws.w} h={ws.h}
                   active={activeWin === 'dm:' + id} onActivate={activateWin} onClose={() => closeDM(id)}
                   minSize={{ w: 260, h: 220 }}>
                <DMWindow agent={agent} log={dmListFor(id)} onSend={sendDM} observerName={observer.name} />
              </Win>
            </div>
          );
        })}

        {/* Chat picker mini-dialog */}
        {chatPickerOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.3)', zIndex: 100000 }}
               onClick={() => setChatPickerOpen(false)}>
            <div className="win" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
              <div className="win-titlebar">
                <span className="win-title-text">Open chat for…</span>
                <div className="win-btns"><button className="win-btn" onClick={() => setChatPickerOpen(false)}>×</button></div>
              </div>
              <div className="win-body" style={{ padding: 12 }}>
                {repos.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>no repos yet — once an agent registers, you can open its chat.</div>}
                {repos.map((r) => (
                  <div key={r.repoPath}
                       style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                       onClick={() => { openChatForRepo(r.repoPath); setChatPickerOpen(false); }}>
                    <b>{r.basename}</b> <span style={{ color: '#666' }}>· {r.agentCount} online</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {errorBanner && (
          <div style={{ position: 'fixed', top: 4, right: 4, background: '#a00', color: '#fff', padding: '4px 8px', fontSize: 11, zIndex: 99998 }}
               onClick={dismissError}>
            {errorBanner} (click to dismiss)
          </div>
        )}
      </div>

      <div className="hint">tip: double-click a repo folder to open chat · double-click a buddy to IM · right-click an offline buddy to delete · drag titlebars to move</div>
    </>
  );
}

window.AOL_THEME_SHELL = Shell;
