  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const state = {
    conversations: [],
    currentId: null,
    agent: 'general',
    streaming: false,
  };

  const AGENTS = {
    general: {name: 'General', system: 'Clear answers with examples.', accent: 'var(--brand)'},
    coder: {name: 'Coder', system: 'Write clean, commented code.', accent: 'var(--success)'},
    designer: {name: 'Designer', system: 'Give structured, visual suggestions.', accent: 'var(--warn)'}
  };

  function uid(){ return Math.random().toString(36).slice(2,9); }

  function save(){ localStorage.setItem('chat.convs', JSON.stringify(state.conversations)); }
  function load(){ try { state.conversations = JSON.parse(localStorage.getItem('chat.convs')||'[]'); } catch { state.conversations=[]; } }

  function newConversation(seed=true){
    const id = uid();
    const conv = { id, title: 'New chat', created: Date.now(), messages: [] };
    state.conversations.unshift(conv);
    state.currentId = id;
    save();
    renderConversations();
    renderThread();
    if(seed) seedWelcome();
  }

  function seedWelcome(){
    const agent = AGENTS[state.agent];
    addMessage({role:'assistant', content:`Welcome. Select an agent, then ask your question.`, meta:agent.name});
    renderSuggestions([
      'Explain this code snippet',
      'Draft a product update',
      'Design a landing page section',
      'Create a study plan'
    ]);
  }

  function current(){ return state.conversations.find(c => c.id===state.currentId); }

  function renderConversations(){
    const list = $('#convList');
    list.innerHTML = '';
    state.conversations.forEach(c => {
      const el = document.createElement('div');
      el.className = 'conv';
      el.innerHTML = `<div class="conv-title">${escapeHtml(c.title)}</div>
                      <div class="conv-sub">${new Date(c.created).toLocaleString()}</div>`;
      el.onclick = () => { state.currentId = c.id; renderThread(); highlightActiveConv(); };
      list.appendChild(el);
    });
    highlightActiveConv();
  }
  function highlightActiveConv(){
    $$('#convList .conv').forEach((el,i) => {
      const id = state.conversations[i]?.id; el.style.outline = id===state.currentId ? '2px solid rgba(124,156,255,.35)' : 'none';
    });
  }

  function renderThread(){
    const thread = $('#thread');
    thread.innerHTML = '';
    const conv = current();
    if(!conv) return;
    conv.messages.forEach(m => thread.appendChild(renderMessage(m)));
    thread.scrollTop = thread.scrollHeight;
  }

  function messageAvatar(role){
    const el = document.createElement('div');
    el.className = 'avatar';
    if(role==='user') el.textContent = '🧑'; else el.textContent = '🤖';
    return el;
  }

  function renderMessage(m){
    const tpl = $('#tpl-msg');
    const node = tpl.content.firstElementChild.cloneNode(true);
    if(m.role==='user') node.classList.add('user');
    node.querySelector('.avatar').replaceWith(messageAvatar(m.role));
    node.querySelector('.meta').textContent = `${m.role==='user'?'You':'Assistant'} • ${m.meta||new Date(m.time||Date.now()).toLocaleTimeString()}`;
    node.querySelector('.bubble').innerHTML = toHtml(m.content);

    const tools = node.querySelector('.tools');
    tools.append(
      toolBtn('Copy', () => copyText(stripHtml(m.content))),
      toolBtn('↻', () => regenerate(m)) ,
      toolBtn('⋯', () => quickActions(m))
    );
    return node;
  }

  function toolBtn(label, onclick){
    const b = document.createElement('button');
    b.className = 'tool'; b.textContent = label; b.onclick = onclick; return b;
  }

  function addMessage(m){
    const conv = current();
    const msg = { id: uid(), time: Date.now(), ...m };
    conv.messages.push(msg);
    save();
    const node = renderMessage(msg);
    $('#thread').appendChild(node);
    $('#thread').scrollTop = $('#thread').scrollHeight;
    return msg;
  }

  function send(){
    const ta = $('#prompt');
    const text = ta.value.trim();
    if(!text || state.streaming) return;
    addMessage({role:'user', content: escapeHtml(text)});
    ta.value = '';
    state.streaming = true; $('#stopBtn').disabled = false; renderTyping();
    fakeReply(text);
    smartTitle();
  }

  function renderTyping(){
    const node = document.createElement('div');
    node.className='msg'; node.id='typing';
    node.innerHTML = `<div class="avatar">🤖</div>
      <div><div class="meta">Assistant</div>
      <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    $('#thread').appendChild(node);
    $('#thread').scrollTop = $('#thread').scrollHeight;
  }

  function stop(){ state.streaming=false; $('#stopBtn').disabled = true; const t=$('#typing'); if(t) t.remove(); }

  function regenerate(m){ if(state.streaming) return; const userLast = lastUserBefore(m.id); if(userLast) fakeReply(stripHtml(userLast.content), true); }
  function quickActions(m){ alert('Quick actions placeholder.'); }

  function lastUserBefore(id){
    const msgs = current().messages;
    const i = msgs.findIndex(x=>x.id===id);
    for(let j=i-1;j>=0;j--) if(msgs[j].role==='user') return msgs[j];
    return null;
  }

  function fakeReply(prompt, isRegen=false){
    setTimeout(async () => {
      const agent = AGENTS[state.agent];
      const content = buildResponse(prompt, agent, isRegen);
      stream(content, chunk => {
        const t = $('#typing');
        if(!t) return;
        const bubble = t.querySelector('.bubble');
        bubble.innerHTML = toHtml(chunk);
      }, () => {
        const t = $('#typing');
        if(!t) return;
        const html = t.querySelector('.bubble').innerHTML;
        t.remove();
        addMessage({role:'assistant', content: html, meta: agent.name});
        state.streaming=false; $('#stopBtn').disabled = true;
      });
    }, 350);
  }

  function buildResponse(prompt, agent, regen){
    const base = {
      general: `\n<b>Summary</b>\n• You asked: ${escapeHtml(prompt)}\n• Short answer: use clear steps.\n\n<b>Actionable steps</b>\n1. Define goal.\n2. Break into tasks.\n3. Execute, review, iterate.\n\n<b>Tip</b>\nKeep messages short and specific.`,
      coder: `\n<b>Plan</b>\n• Validate input.\n• Handle errors.\n• Write tests.\n\n<b>Example (JavaScript)</b>\n<pre><code>function sum(a, b) {\n  if (typeof a!== 'number' || typeof b!== 'number') throw new TypeError('numbers');\n  return a + b;\n}\n</code></pre>\n<b>Test</b>\n<pre><code>console.log(sum(2,3)); // 5</code></pre>`,
      designer: `\n<b>Structure</b>\n• Header with clear CTA.\n• Grid for content.\n• Consistent spacing.\n\n<b>Checklist</b>\n□ 8pt spacing.\n□ 3 sizes for type.\n□ Contrast ≥ 4.5:1.`
    };
    const txt = base[state.agent] || base.general;
    const foot = `\n\n<span style="color:${agent.accent}">Agent:</span> ${agent.name}${regen?' • Regenerated':''}`;
    return txt + foot;
  }

  async function stream(full, onChunk, onDone){
    const tokens = full.split(/(\s+)/); // keep spacing
    let out = '';
    for(const t of tokens){
      if(!state.streaming) break;
      out += t; onChunk(out);
      await delay(18 + Math.random()*22);
    }
    onDone();
  }

  const delay = ms => new Promise(r=>setTimeout(r, ms));

  function smartTitle(){
    const conv = current();
    const u = [...conv.messages].reverse().find(m=>m.role==='user');
    if(!u) return;
    const t = stripHtml(u.content).slice(0, 42);
    conv.title = t || 'New chat';
    save();
    renderConversations();
  }

  function renderSuggestions(items){
    const box = $('#suggest'); box.innerHTML = '';
    items.forEach(txt => {
      const chip = document.createElement('button');
      chip.className = 'chip'; chip.textContent = txt;
      chip.onclick = () => { $('#prompt').value = txt; $('#prompt').focus(); };
      box.appendChild(chip);
    });
  }

  function setAgent(id){
    state.agent = id;
    $$('#agents .agent').forEach(a=>a.classList.toggle('active', a.dataset.id===id));
  }

  function escapeHtml(str){ return str.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s])); }
  function stripHtml(str){ const d=document.createElement('div'); d.innerHTML=str; return d.textContent||''; }
  function toHtml(str){
    // minimal markdown: code fence and bold
    str = str.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    str = str.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    str = str.replace(/\n/g, '<br>');
    return str;
  }

  // Events
  $('#sendBtn').onclick = send;
  $('#stopBtn').onclick = stop;
  $('#newChatBtn').onclick = () => newConversation();
  $('#clearAllBtn').onclick = () => { if(confirm('Delete all conversations?')) { state.conversations=[]; state.currentId=null; save(); renderConversations(); $('#thread').innerHTML=''; newConversation(); } };
  $('#agents').addEventListener('click', e => { const btn = e.target.closest('.agent'); if(btn) setAgent(btn.dataset.id); });

  const promptEl = $('#prompt');
  promptEl.addEventListener('keydown', e => {
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    if(e.key==='/' && !promptEl.value){ e.preventDefault(); promptEl.value='Explain like I\'m 12: '; }
  });
  promptEl.addEventListener('input', () => {
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 180) + 'px';
  });

  // Init
  load();
  if(state.conversations.length){ state.currentId = state.conversations[0].id; renderConversations(); renderThread(); }
  else { newConversation(); }