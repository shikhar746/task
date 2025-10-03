(async function(){
  const connectBtn = document.getElementById('connectBtn');
  const registerBtn = document.getElementById('registerBtn');
  const submitProposalBtn = document.getElementById('submitProposalBtn');
  const proposalsContainer = document.getElementById('proposals');
  const regStatus = document.getElementById('regStatus');
  const refreshBtn = document.getElementById('refreshBtn');
  const proposalText = document.getElementById('proposalText');

  // CONFIG — replace with your deployed contract address
  const CONTRACT_ADDRESS = "0xYourContractAddress";
  // abi.json should be placed next to index.html
  let ABI = [];
  try {
    const resp = await fetch('abi.json');
    ABI = await resp.json();
  } catch(e) {
    console.warn('Could not load ABI (abi.json). Make sure to place ABI file next to index.html');
  }

  let provider;
  let signer;
  let contract;
  let account;

  function short(addr){
    if(!addr) return '';
    return addr.slice(0,6) + '...' + addr.slice(-4);
  }

  async function setConnected(a){
    account = a;
    connectBtn.textContent = account ? `Connected: ${short(account)}` : 'Connect Wallet';
    if(account){
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      checkRegistration();
      loadProposals();
    }
  }

  // CONNECT WALLET
  connectBtn.addEventListener('click', async ()=>{
    if(!window.ethereum){ alert('MetaMask / wallet not found.'); return; }
    try{
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
      await setConnected(accs[0]);
    } catch(e){ console.error(e); alert('Connection failed: '+e.message); }
  });

  // REGISTER
  registerBtn.addEventListener('click', async ()=>{
    if(!account){ alert('Connect wallet first'); return; }
    try{
      const tx = await contract.enrollParticipant();
      await tx.wait();
      alert('Registration transaction mined.');
      checkRegistration();
    } catch(e){
      console.error(e);
      alert('Registration failed: '+ (e?.message || e));
    }
  });

  // SUBMIT PROPOSAL
  submitProposalBtn.addEventListener('click', async ()=>{
    if(!account){ alert('Connect wallet first'); return; }
    const text = proposalText.value.trim();
    if(!text){ alert('Enter proposal text.'); return; }
    try{
      const tx = await contract.submitProposal(text);
      await tx.wait();
      alert('Proposal submitted.');
      proposalText.value = '';
      loadProposals();
    } catch(e){
      console.error(e);
      alert('Submit failed: '+ (e?.message || e));
    }
  });

  // CHECK REGISTRATION (calls a simple view — adjust name according to ABI)
  async function checkRegistration(){
    if(!contract || !account) return;
    try{
      // assumes contract has a mapping 'registered' or function isRegistered(address)
      if(typeof contract.isRegistered === 'function'){
        const r = await contract.isRegistered(account);
        regStatus.innerHTML = 'Status: <span class="font-medium">' + (r ? '✅ Registered' : '❌ Not Registered') + '</span>';
      } else {
        regStatus.innerHTML = 'Status: <span class="font-medium">Unknown — contract lacks isRegistered()</span>';
      }
    } catch(e){
      console.warn(e);
      regStatus.innerHTML = 'Status: <span class="font-medium">Error</span>';
    }
  }

  // LOAD PROPOSALS
  async function loadProposals(){
    proposalsContainer.innerHTML = '<div class="text-sm text-slate-500">Loading...</div>';
    if(!contract) { proposalsContainer.innerHTML = '<div class="text-sm text-red-500">Connect wallet to load proposals.</div>'; return; }
    try{
      const count = await contract.proposalCounter();
      const n = Number(count);
      if(n === 0){
        proposalsContainer.innerHTML = '<div class="text-sm text-slate-600">No proposals yet.</div>';
        return;
      }
      proposalsContainer.innerHTML = '';
      for(let i=1;i<=n;i++){
        const p = await contract.proposals(i);
        // expecting p to be a struct: { description, yesVotes, noVotes, active, proposer }
        const desc = p.description || p[0] || '';
        const yes = p.yesVotes?.toString ? p.yesVotes.toString() : (p[1] || '0').toString();
        const no = p.noVotes?.toString ? p.noVotes.toString() : (p[2] || '0').toString();
        const active = (p.active!==undefined) ? p.active : (p[3]===undefined ? true : p[3]);
        const proposer = p.proposer || p[4] || '';
        const card = document.createElement('div');
        card.className = 'p-4 bg-slate-50 border rounded';
        card.innerHTML = `<div class="flex justify-between items-start">
            <div>
              <div class="text-sm text-slate-500">Proposal #${i} by ${short(proposer)}</div>
              <div class="font-medium mt-1">${escapeHtml(desc)}</div>
            </div>
            <div class="text-right">
              <div>✅ <span id="yes-${i}">${yes}</span></div>
              <div>❌ <span id="no-${i}">${no}</span></div>
            </div>
          </div>`;
        if(active){
          const actions = document.createElement('div');
          actions.className = 'mt-3 space-x-2';
          const sup = document.createElement('button');
          sup.className = 'px-3 py-1 bg-green-600 text-white rounded';
          sup.textContent = 'Support';
          sup.onclick = ()=>castVote(i, true);
          const opp = document.createElement('button');
          opp.className = 'px-3 py-1 bg-red-600 text-white rounded';
          opp.textContent = 'Oppose';
          opp.onclick = ()=>castVote(i, false);
          actions.appendChild(sup);
          actions.appendChild(opp);
          card.appendChild(actions);
        } else {
          const closed = document.createElement('div');
          closed.className = 'mt-3 text-sm text-slate-600';
          closed.textContent = 'Voting closed';
          card.appendChild(closed);
        }
        proposalsContainer.appendChild(card);
      }
    } catch(e){
      console.error(e);
      proposalsContainer.innerHTML = '<div class="text-sm text-red-500">Error loading proposals. See console.</div>';
    }
  }

  // CAST VOTE
  async function castVote(id, support){
    if(!contract || !account){ alert('Connect wallet first'); return; }
    try{
      const tx = await contract.castVote(id, support);
      await tx.wait();
      alert('Vote recorded.');
      loadProposals();
    } catch(e){
      console.error(e);
      alert('Vote failed: '+ (e?.message || e));
    }
  }

  refreshBtn.addEventListener('click', loadProposals);

  // small helper
  function escapeHtml(s){
    if(!s) return '';
    return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }

  // Auto-connect if already authorized
  if(window.ethereum){
    window.ethereum.request({ method: 'eth_accounts' }).then(accs=>{
      if(accs && accs.length) setConnected(accs[0]);
    });
    window.ethereum.on && window.ethereum.on('accountsChanged', (accs)=> setConnected(accs && accs[0] ? accs[0] : null));
  }
})();