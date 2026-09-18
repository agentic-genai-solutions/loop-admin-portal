'use client';

import AdminWorkspace from '@/components/admin/AdminWorkspace';

import { useEffect, useRef, useState } from 'react';
import { TableSkeleton } from '@/components/Loaders';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import styles from './messages.module.css';

type Store = { _id?: string; id?: string; name: string; isActive?: boolean; isDeleted?: boolean; deletedAt?: string };
type User = { _id?: string; id?: string; employeeId?: string; firstName?: string; lastName?: string; storeId?: string; isActive?: boolean; isDeleted?: boolean; deletedAt?: string };
type Message = { styleVariant?: string; emoji?: string; messageId: string; title: string; body: string; scope: string; targetStoreId?: string; targetEmployeeIds?: string[]; startsAt?: string; expiresAt?: string; createdAt?: string };
type Audience = 'organization' | 'store' | 'employee' | 'directors';
const recipientId = (user: User) => String(user.employeeId || user._id || user.id || '').trim();
const userName = (user: User) => [user.firstName, user.lastName].filter(Boolean).join(' ') || recipientId(user);
const storeId = (store: Store) => String(store._id || store.id || '');
const active = (record: User | Store) => record.isActive !== false && !record.isDeleted && !record.deletedAt;
const initialForm = { audience: 'employee' as Audience, store: '', recipient: '', title: '', body: '', styleVariant: 'standard', category: 'general', priority: 'normal', startsAt: '', expiresAt: '' };
const audienceChoices: { value: Audience; title: string; help: string }[] = [
  { value: 'employee', title: 'One staff member', help: 'Choose a store, then a person' },
  { value: 'store', title: 'A whole store', help: 'Everyone working at one store' },
  { value: 'organization', title: 'Everyone', help: 'All users, including directors' },
  { value: 'directors', title: 'Directors', help: 'One director or all directors' },
];
const messageStyles = [
  { value: 'standard', label: 'General update', emoji: '💬', category: 'general', priority: 'normal', help: 'A simple everyday message.', example: 'Share an update with your team.' },
  { value: 'celebration', label: 'Celebration', emoji: '🎉', category: 'celebration', priority: 'normal', help: 'Celebrate a special occasion together.', example: 'Tell your team what you’re celebrating and how to join in.' },
  { value: 'warning', label: 'Warning', emoji: '⚠️', category: 'alert', priority: 'high', help: 'Highlight a risk or something to be careful about.', example: 'Explain the risk and what people should do to stay safe.' },
  { value: 'alert', label: 'Alert', emoji: '🚨', category: 'alert', priority: 'high', help: 'Make an important notice stand out.', example: 'Explain what has changed and who needs to know.' },
  { value: 'urgent', label: 'Quick action needed', emoji: '⏰', category: 'instruction', priority: 'high', help: 'Make the next step and deadline clear.', example: 'What needs to be done? By when? Who should take action?' },
  { value: 'memorial', label: 'Bereavement', emoji: '🕊️', category: 'obituary', priority: 'normal', help: 'A quiet, respectful message of remembrance.', example: 'Share your condolences and any arrangements the team should know about.' },
  { value: 'achievement', label: 'Achievement', emoji: '🏆', category: 'achievement', priority: 'normal', help: 'Recognize a milestone or outstanding result.', example: 'Share the achievement and recognize the people behind it.' },
  { value: 'felicitation', label: 'Felicitation', emoji: '👏', category: 'felicitation', priority: 'normal', help: 'Congratulate someone on their success.', example: 'Who are you congratulating, and what have they accomplished?' },
  { value: 'encouragement', label: 'Encouragement', emoji: '💪', category: 'motivation', priority: 'normal', help: 'Lift spirits and encourage your team.', example: 'Recognize their effort and share a few words of encouragement.' },
  { value: 'guidelines', label: 'Guidelines', emoji: '📋', category: 'instruction', priority: 'normal', help: 'Share clear instructions people can follow.', example: 'Write the steps to follow, one per line. Include who to contact for help.' },
];
const getMessageStyle = (value?: string) => messageStyles.find(style => style.value === value) || messageStyles[0];
const emojiGroups = [
  { label: 'Everyday', items: [['😊', 'Smile'], ['😀', 'Happy'], ['😄', 'Big smile'], ['😉', 'Wink'], ['❤️', 'Heart'], ['👍', 'Thumbs up'], ['👏', 'Applause'], ['🙏', 'Thank you']] },
  { label: 'Celebrate', items: [['🎉', 'Celebration'], ['🎊', 'Confetti'], ['🎂', 'Birthday cake'], ['🎈', 'Balloon'], ['🎁', 'Gift'], ['🏆', 'Trophy'], ['🌟', 'Shining star'], ['🥳', 'Party face']] },
  { label: 'Work & updates', items: [['📢', 'Announcement'], ['📌', 'Pin'], ['📅', 'Calendar'], ['⏰', 'Reminder'], ['✅', 'Done'], ['⚠️', 'Attention'], ['💡', 'Idea'], ['🎯', 'Goal']] },
  { label: 'Encouragement', items: [['💪', 'Strength'], ['🤝', 'Teamwork'], ['🙌', 'Well done'], ['✨', 'Sparkles'], ['🚀', 'Rocket'], ['💯', 'Excellent'], ['🌷', 'Flower'], ['🕊️', 'Peace']] },
];
function Icon({ name }: { name: 'employee' | 'store' | 'organization' | 'directors' | 'send' | 'message' | 'search' }) {
  const paths = {
    employee: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6',
    store: 'M3 10v11h18V10M2 10l3-7h14l3 7M2 10h20M9 21v-7h6v7',
    organization: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    directors: 'M12 3l3 6 6 .9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.9 9 9z',
    send: 'M22 2L9 15M22 2l-7 20-6-7-7-6 20-7z',
    message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5z',
    search: 'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function MessagesPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [directors, setDirectors] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const emojiPicker = useRef<HTMLDetailsElement>(null);
  const [emojiNotice, setEmojiNotice] = useState('');

  function insertEmoji(emoji: string) {
    const input = messageInput.current;
    if (!input || sending || !ready) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const body = form.body.slice(0, start) + emoji + form.body.slice(end);
    if (body.length > 2000) {
      setEmojiNotice('Your message is full. Remove a little text to add an emoji.');
      return;
    }
    setForm(current => ({ ...current, body }));
    setEmojiNotice('');
    if (emojiPicker.current) emojiPicker.current.open = false;
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }


  async function loadHistory() {
    setHistoryError('');
    setHistoryLoading(true);
    try { setMessages(await apiFetchWithRetry<Message[]>('/accounting/messages?limit=50')); }
    catch { setHistoryError('We couldn’t load your earlier messages. Please try again.'); }
    finally { setHistoryLoading(false); }
  }
  async function loadRecipients() {
    setLoading(true);
    setReady(false);
    setError('');
    try {
      const [storeRows, userRows, directorRows] = await Promise.all([
        apiFetchWithRetry<Store[]>('/stores'),
        apiFetchWithRetry<User[]>('/users'),
        apiFetchWithRetry<User[]>('/users/directors'),
      ]);
      setStores(storeRows.filter(active).sort((a, b) => a.name.localeCompare(b.name)));
      setUsers(userRows.filter(user => active(user) && recipientId(user)).sort((a, b) => userName(a).localeCompare(userName(b))));
      setDirectors(directorRows.filter(user => active(user) && recipientId(user)).sort((a, b) => userName(a).localeCompare(userName(b))));
      setReady(true);
    } catch { setError('We couldn’t load the list of people and stores. Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadRecipients(); void loadHistory(); }, []);

  const selectedStyle = getMessageStyle(form.styleVariant);
  const staff = users.filter(user => String(user.storeId || '') === form.store);
  const recipients = form.audience === 'directors' ? directors : staff;
  const selected = recipients.find(user => recipientId(user) === form.recipient);
  const audienceLabel = form.audience === 'organization' ? 'Everyone in the organization'
    : form.audience === 'directors' && !form.recipient ? `All directors (${directors.length})`
    : form.audience === 'employee' ? (selected ? userName(selected) : 'Choose a store and a staff member')
    : selected ? userName(selected)
    : stores.find(store => storeId(store) === form.store)?.name || 'Choose who to send this to';

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !ready) return;
    setError(''); setSuccess('');
    if (!form.title.trim() || !form.body.trim()) { setError('Enter a title and message.'); return; }
    if ((form.audience === 'store' || form.audience === 'employee') && !stores.some(store => storeId(store) === form.store)) { setError('Select a store.'); return; }
    if (form.audience === 'employee' && !selected) { setError('Select a staff member in this store.'); return; }
    if (form.audience === 'directors' && (!directors.length || (form.recipient && !selected))) { setError('Select an available director.'); return; }
    const start = form.startsAt ? new Date(form.startsAt) : new Date();
    const expiry = form.expiresAt ? new Date(form.expiresAt) : null;
    if (Number.isNaN(start.getTime()) || (expiry && (Number.isNaN(expiry.getTime()) || expiry <= start))) { setError('Choose a hide date that is later than the send date.'); return; }
    setSending(true);
    try {
      await apiFetch('/accounting/messages', { method: 'POST', body: JSON.stringify({
        title: form.title.trim(), body: form.body.trim(), category: form.category, priority: form.priority,
        styleVariant: form.styleVariant, emoji: form.styleVariant === 'standard' ? undefined : selectedStyle.emoji,
        scope: form.audience === 'directors' ? 'employee' : form.audience,
        targetStoreId: form.audience === 'store' ? form.store : undefined,
        targetEmployeeIds: form.audience === 'employee' ? [form.recipient] : form.audience === 'directors' ? (form.recipient ? [form.recipient] : directors.map(recipientId)) : undefined,
        startsAt: start.toISOString(), expiresAt: expiry?.toISOString(),
      }) });
      setSuccess(`${form.startsAt && start > new Date() ? 'Message scheduled' : 'Message sent'} to ${audienceLabel}.`);
      setForm(initialForm);
      setEmojiNotice('');
      if (emojiPicker.current) emojiPicker.current.open = false;
      await loadHistory();
    } catch { setError('Your message wasn’t sent. Your text is still here. Please try again.'); }
    finally { setSending(false); }
  }

  function describeRecipients(message: Message) {
    if (message.scope === 'organization') return 'Everyone in the organization';
    if (message.scope === 'store') return stores.find(store => storeId(store) === message.targetStoreId)?.name || message.targetStoreId || 'Store';
    return (message.targetEmployeeIds || []).map(id => {
      const user = [...users, ...directors].find(entry => recipientId(entry) === id);
      return user ? userName(user) : id;
    }).join(', ');
  }

  const visibleMessages = messages.filter(message => `${message.title} ${message.body} ${describeRecipients(message)}`.toLowerCase().includes(search.toLowerCase()));
  const canSend = ready && !sending && Boolean(form.title.trim() && form.body.trim()) && (form.audience !== 'employee' || Boolean(selected)) && (form.audience !== 'store' || Boolean(form.store)) && (form.audience !== 'directors' || directors.length > 0);

  return <AdminWorkspace>
    <header className={styles.pageHeader}>
      <div><span className={styles.eyebrow}>TEAM COMMUNICATION</span><h2>A little update. A connected team.</h2><p>Send the right message to the right people.</p></div>
      <span className={styles.channel}><span /> Delivered in the app</span>
    </header>
    {success && <p role="status" className={styles.success}>{success}</p>}
    {error && <p role="alert" className={styles.error}>{error} {!ready && !loading && <button type="button" onClick={() => void loadRecipients()}>Try again</button>}</p>}
    <form onSubmit={sendMessage} className={styles.workspace}>
      <section className={styles.composer} aria-labelledby="compose-title">
        <div className={styles.sectionHeader}><span className={styles.headingIcon}><Icon name="message" /></span><div><h2 id="compose-title">New message</h2><p>A quick note, an important update, or a thank you.</p></div></div>
        <fieldset disabled={loading || sending || !ready} className={styles.formFields}>
          <fieldset className={styles.audience}>
            <legend className={styles.label}>Who would you like to message?</legend>
            <div className={styles.choices}>
              {audienceChoices.map(choice => <label key={choice.value} className={`${styles.choice} ${form.audience === choice.value ? styles.selected : ''}`} title={choice.help}>
                <input type="radio" name="audience" value={choice.value} checked={form.audience === choice.value} onChange={() => setForm(current => ({ ...current, audience: choice.value, store: '', recipient: '' }))} />
                <Icon name={choice.value} /><strong>{choice.title}</strong>
              </label>)}
            </div>
            <p className={styles.choiceHint}>{audienceChoices.find(choice => choice.value === form.audience)?.help}.</p>
          </fieldset>
          <div className={styles.recipientFields}>
          {(form.audience === 'employee' || form.audience === 'store') && <label className={styles.field}>Which store?
            <select required className={styles.input} value={form.store} onChange={event => setForm(current => ({ ...current, store: event.target.value, recipient: '' }))}>
              <option value="">Select a store</option>{stores.map(store => <option key={storeId(store)} value={storeId(store)}>{store.name}</option>)}
            </select>{!stores.length && <small>There are no stores to choose from. Ask your administrator to add a store.</small>}
          </label>}
          {(form.audience === 'employee' || form.audience === 'directors') && <label className={styles.field}>{form.audience === 'directors' ? 'Which director?' : 'Which staff member?'}
            <select required={form.audience === 'employee'} disabled={form.audience === 'employee' && !form.store} className={styles.input} value={form.recipient} onChange={event => setForm(current => ({ ...current, recipient: event.target.value }))}>
              <option value="">{form.audience === 'directors' ? `All directors (${directors.length})` : form.store ? 'Choose a name' : 'Choose a store first'}</option>
              {recipients.map(user => <option key={recipientId(user)} value={recipientId(user)}>{userName(user)}{user.employeeId ? ` · ${user.employeeId}` : ''}</option>)}
            </select>{!recipients.length && (form.store || form.audience === 'directors') && <small>No people are listed here. Ask your administrator to check their account and store details.</small>}
          </label>}
          </div>
          <fieldset className={styles.audience}>
            <legend className={styles.label}>Choose a message style</legend>
            <div className={styles.styleChoices}>
              {messageStyles.map(style => <label key={style.value} data-variant={style.value} className={`${styles.styleChoice} ${form.styleVariant === style.value ? styles.styleSelected : ''}`}>
                <input type="radio" name="message-style" value={style.value} checked={form.styleVariant === style.value} onChange={() => setForm(current => ({ ...current, styleVariant: style.value, category: style.category, priority: style.priority }))} />
                <span aria-hidden="true">{style.emoji}</span>{style.label}
              </label>)}
            </div>
            <p className={styles.choiceHint}>{selectedStyle.help}</p>
          </fieldset>
          <div className={styles.writing}>
            <label className={styles.field}>Subject<input required maxLength={120} className={styles.input} placeholder="e.g. Team meeting tomorrow" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label>
            <label className={styles.field}><span className={styles.fieldHeading}>Your message <span>{form.body.length.toLocaleString()} / 2,000</span></span><textarea ref={messageInput} required maxLength={2000} rows={6} className={styles.input} placeholder={selectedStyle.example} value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} /></label>
            <div className={styles.emojiToolbar}>
              <details ref={emojiPicker} className={styles.emojiPicker} onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus();
                }
              }}>
                <summary><span aria-hidden="true">😊</span> Add emoji</summary>
                <div className={styles.emojiPanel}>
                  <div className={styles.emojiHeader}><strong>Choose an emoji</strong><span>Click to add to your message</span></div>
                  {emojiGroups.map(group => <section key={group.label} aria-label={group.label}>
                    <h4>{group.label}</h4>
                    <div className={styles.emojiGrid}>{group.items.map(([emoji, label]) => <button key={label} type="button" title={label} aria-label={`Add ${label.toLowerCase()} emoji`} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div>
                  </section>)}
                </div>
              </details>
              <span className={styles.emojiHint}>Add a personal touch.</span>
            </div>
            {emojiNotice && <p role="status" className={styles.hint}>{emojiNotice}</p>}
          </div>
          <details className={styles.options}><summary>Schedule & more options <span>Optional</span></summary>
            <div className={styles.optionsGrid}>
              <label className={styles.field}>How important is it?<select className={styles.input} value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value }))}><option value="normal">Normal</option><option value="high">Important</option></select></label>
              <label className={styles.field}>Send later<input type="datetime-local" className={styles.input} value={form.startsAt} onChange={event => setForm(current => ({ ...current, startsAt: event.target.value }))} /><small className={styles.hint}>Leave blank to send right away.</small></label>
              <label className={styles.field}>Hide from the app after<input type="datetime-local" className={styles.input} value={form.expiresAt} onChange={event => setForm(current => ({ ...current, expiresAt: event.target.value }))} /><small className={styles.hint}>Leave blank to keep the message visible.</small></label>
            </div>
          </details>
        </fieldset>
        <footer className={styles.composerFooter}>
          <div><strong>{form.startsAt ? 'Send later' : 'Ready when you are'}</strong><p>{loading ? 'Loading people and stores…' : !ready ? 'Reload the recipient list to continue.' : !canSend ? 'Choose your recipients and write a message.' : 'Your message is ready to send.'}</p></div>
          <button className={styles.sendButton} type="submit" disabled={!canSend}><Icon name="send" />{sending ? 'Sending…' : form.startsAt ? 'Schedule message' : 'Send message'}</button>
        </footer>
      </section>
      <aside className={styles.previewPanel} aria-label="Message preview">
        <div className={styles.previewHeading}><span className={styles.eyebrow}>LIVE PREVIEW</span><span className={styles.previewDot} /></div>
        <h3>Here’s how it will look</h3><p className={styles.hint}>A quick look before you send.</p>
        <div className={styles.previewCard} data-variant={form.styleVariant}>
          <div className={styles.previewSender}><span className={styles.avatar} aria-hidden="true">{selectedStyle.emoji}</span><div><strong>{selectedStyle.label}</strong><span>{form.startsAt ? 'Scheduled message' : 'New message'}</span></div>{form.priority === 'high' && <span className={styles.important}>Important</span>}</div>
          <h4 className={!form.title ? styles.placeholder : ''}>{form.styleVariant !== 'standard' && `${selectedStyle.emoji} `}{form.title || 'Your subject goes here'}</h4>
          <p className={!form.body ? styles.placeholder : ''}>{form.body || 'Start writing and your message will appear here.'}</p>
        </div>
        <dl className={styles.delivery}>
          <div><dt>Sending to</dt><dd><Icon name={form.audience} /><span>{audienceLabel}</span></dd></div>
          <div><dt>When</dt><dd>{form.startsAt ? new Date(form.startsAt).toLocaleString() : 'As soon as you press send'}</dd></div>
          {form.expiresAt && <div><dt>Visible until</dt><dd>{new Date(form.expiresAt).toLocaleString()}</dd></div>}
        </dl>
        <p className={styles.previewNote}>Your team can read this message in their app.</p>
      </aside>
    </form>
    <section className={styles.history} aria-labelledby="history-title">
      <div className={styles.historyHeader}><div><h2 id="history-title">Sent messages <span>{messages.length}</span></h2><p>Your recent updates, all in one place.</p></div><label className={styles.search}><Icon name="search" /><input aria-label="Search sent messages" placeholder="Search messages…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      {historyError && <p role="alert" className={styles.error}>{historyError} <button type="button" onClick={() => void loadHistory()}>Try again</button></p>}
      {historyLoading ? <TableSkeleton rows={3} columns={3} /> : visibleMessages.length ? <div className={styles.messageList}>{visibleMessages.map(message => {
        const expired = message.expiresAt && new Date(message.expiresAt) <= new Date();
        const scheduled = !expired && message.startsAt && new Date(message.startsAt) > new Date();
        return <details key={message.messageId} className={styles.messageRow}>
          <summary><span className={styles.messageIcon}><Icon name="message" /></span><span className={styles.messageText}><strong>{message.emoji && `${message.emoji} `}{message.title}</strong><span>To: {describeRecipients(message)}</span></span><span className={`${styles.badge} ${expired ? styles.expired : scheduled ? styles.scheduled : ''}`}>{expired ? 'Ended' : scheduled ? 'Scheduled' : 'Sent'}</span><time className={styles.messageDate}>{message.createdAt ? new Date(message.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</time><span className={styles.chevron} aria-hidden="true">⌄</span></summary>
          <div className={styles.messageBody} data-variant={message.styleVariant}><span className={styles.messageStyleLabel}>{getMessageStyle(message.styleVariant).label}</span><p>{message.body}</p>{scheduled && <small>Sends on {new Date(message.startsAt!).toLocaleString()}</small>}{message.expiresAt && <small>Visible until {new Date(message.expiresAt).toLocaleString()}</small>}</div>
        </details>;
      })}</div> : !historyError && <div className={styles.empty}><span><Icon name={search ? 'search' : 'message'} /></span><h3>{search ? 'No matching messages' : 'Your first message starts here'}</h3><p>{search ? 'Try another name or word.' : 'Send a note above. You’ll find it here when it’s sent.'}</p></div>}
    </section>
  </AdminWorkspace>;
}
