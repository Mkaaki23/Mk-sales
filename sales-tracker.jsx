import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://dgzgxabmoumkvleavpfr.supabase.co";
const SUPABASE_KEY = "sb_publishable_61K_X-dHoA6SPhFzDhiv2A_oUCCGZwi";

const db = async (path, method = "GET", body = null) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : method === "PATCH" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  if (res.status === 204) return null;
  return res.json();
};

const COMPANIES = {
  royal_gardens: { name: "Royal Gardens Contracting", short: "Royal Gardens", color: "#1B3A8C", accent: "#F5A020", commissionRate: 0.05 },
  gv_pools: { name: "GV Pools", short: "GV Pools", color: "#0a5c5c", accent: "#4ECDC4", commissionRate: 0.04 },
};

const RG_STAGES = ["New Lead","Contacted","Appointment Set","Design Sent","Proposal Out","Negotiating","Closed Won","Closed Lost"];
const GV_STAGES = ["Closed Won"];
const WON = "Closed Won"; const LOST = "Closed Lost";
const STAGE_COLORS = { "New Lead":"#3b4a6b","Contacted":"#4a5d8a","Appointment Set":"#5b6fa8","Design Sent":"#7b8fc8","Proposal Out":"#9b6e20","Negotiating":"#F5A020","Closed Won":"#22c55e","Closed Lost":"#ef4444" };

const rawNum = (s) => parseFloat(String(s).replace(/[^0-9.]/g, "")) || 0;
const fmtDisplay = (n) => (n == null || n === "") ? "—" : "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const today = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const LS = { display:"block", fontSize:10, color:"#5a5a7a", letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:6, fontWeight:700 };
const IS = { background:"#0d0d18", border:"1px solid #252538", borderRadius:8, color:"#e8e8f0", padding:"11px 14px", fontSize:14, width:"100%", boxSizing:"border-box", outline:"none", fontFamily:"inherit" };

function CurrencyField({ label, value, onChange, placeholder = "$0" }) {
  const fmt = (v) => { const n = String(v||"").replace(/[^0-9]/g,""); return n ? "$"+parseInt(n,10).toLocaleString() : ""; };
  const [disp, setDisp] = useState(() => fmt(value));
  const handle = (e) => { const n = e.target.value.replace(/[^0-9]/g,""); setDisp(n?"$"+parseInt(n,10).toLocaleString():""); onChange(n?parseInt(n,10):""); };
  return <div><label style={LS}>{label}</label><input value={disp} onChange={handle} placeholder={placeholder} style={IS} onFocus={e=>e.target.style.borderColor="#F5A020"} onBlur={e=>e.target.style.borderColor="#252538"}/></div>;
}

function TF({ label, value, onChange, placeholder, type="text" }) {
  return <div><label style={LS}>{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={IS} onFocus={e=>e.target.style.borderColor="#F5A020"} onBlur={e=>e.target.style.borderColor="#252538"}/></div>;
}

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value/max)*100,100) : 0;
  return <div style={{background:"#1a1a2e",borderRadius:99,height:5,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:color,borderRadius:99,transition:"width 0.5s ease"}}/></div>;
}

const defaultLead = (company) => ({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now()+"", company, name:"", phone:"", email:"", stage: company==="gv_pools"?WON:"New Lead", valueRaw:"", bonusRaw:"", notes:"", date:today(), closeDate:"" });

export default function App() {
  const [leads, setLeads] = useState([]);
  const [goals, setGoals] = useState({ royal_gardens: 500000, gv_pools: 300000 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("dashboard");
  const [activeCo, setActiveCo] = useState("royal_gardens");
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterStage, setFilterStage] = useState("All");
  const [search, setSearch] = useState("");
  const [editingGoal, setEditingGoal] = useState(null);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const [leadsData, goalsData] = await Promise.all([
          db("leads?order=created_at.desc"),
          db("goals?select=*"),
        ]);
        setLeads((leadsData||[]).map(l => ({ ...l, valueRaw: l.value_raw||"", bonusRaw: l.bonus_raw||"", closeDate: l.close_date||"" })));
        if (goalsData?.length) {
          const g = {}; goalsData.forEach(r => { g[r.company] = r.goal; }); setGoals(g);
        }
      } catch(e) { setError("Could not connect to database: " + e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const cLeads = (co) => leads.filter(l => l.company === co);
  const wonLeads = (co) => cLeads(co).filter(l => l.stage === WON);
  const revenue = (co) => wonLeads(co).reduce((s,l) => s+rawNum(l.valueRaw), 0);
  const bonusTotal = (co) => cLeads(co).reduce((s,l) => s+rawNum(l.bonusRaw), 0);
  const baseComm = (co) => revenue(co) * COMPANIES[co].commissionRate;
  const totalEarned = (co) => baseComm(co) + bonusTotal(co);
  const pipeline = (co) => cLeads(co).filter(l=>l.stage!==WON&&l.stage!==LOST).reduce((s,l)=>s+rawNum(l.valueRaw),0);
  const convRate = (co) => { const t=cLeads(co).length; return t?Math.round((wonLeads(co).length/t)*100):0; };
  const totalRev = Object.keys(COMPANIES).reduce((s,co)=>s+revenue(co),0);
  const totalEarnedAll = Object.keys(COMPANIES).reduce((s,co)=>s+totalEarned(co),0);
  const totalPipe = Object.keys(COMPANIES).reduce((s,co)=>s+pipeline(co),0);

  const openAdd = (co) => { setForm(defaultLead(co||activeCo)); setView("add"); };

  const saveForm = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const row = { id:form.id, company:form.company, name:form.name, phone:form.phone, email:form.email, stage:form.stage, value_raw:rawNum(form.valueRaw)||null, bonus_raw:rawNum(form.bonusRaw)||null, notes:form.notes, date:form.date, close_date:form.closeDate||null };
    try {
      if (form._edit) {
        await db(`leads?id=eq.${form.id}`, "PATCH", row);
        setLeads(p => p.map(l => l.id===form.id ? {...form} : l));
        setSelected({...form});
        setView("detail");
      } else {
        await db("leads", "POST", row);
        setLeads(p => [{...form}, ...p]);
        setView("pipeline");
      }
      setForm(null);
    } catch(e) { alert("Save failed: "+e.message); }
    setSaving(false);
  };

  const deleteLead = async (id) => {
    setSaving(true);
    try { await db(`leads?id=eq.${id}`, "DELETE"); setLeads(p=>p.filter(l=>l.id!==id)); setView("pipeline"); }
    catch(e) { alert("Delete failed: "+e.message); }
    setSaving(false);
  };

  const editLead = (lead) => { setForm({...lead, _edit:true}); setView("add"); };

  const updateStage = async (lead, stage) => {
    const u = {...lead, stage};
    setLeads(p=>p.map(l=>l.id===lead.id?u:l)); setSelected(u);
    try { await db(`leads?id=eq.${lead.id}`, "PATCH", {stage}); }
    catch(e) { alert("Stage update failed: "+e.message); }
  };

  const saveGoal = async (co, val) => {
    const n = rawNum(val); setGoals(g=>({...g,[co]:n})); setEditingGoal(null);
    try { await db(`goals?company=eq.${co}`, "PATCH", {goal:n}); }
    catch(e) { console.error("Goal save failed",e); }
  };

  const co = COMPANIES[activeCo];
  const stages = activeCo==="gv_pools" ? GV_STAGES : RG_STAGES;
  const filtered = leads.filter(l=>l.company===activeCo).filter(l=>filterStage==="All"||l.stage===filterStage).filter(l=>!search||l.name.toLowerCase().includes(search.toLowerCase())||l.phone?.includes(search)||l.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#080810",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#333355"}}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"'Space Grotesk'",fontSize:28,fontWeight:700,color:"#F5A020",marginBottom:8}}>MK<span style={{color:"#fff"}}>.</span></div>
        <div style={{fontSize:13,color:"#333355"}}>Loading your data…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#080810",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#ef4444",padding:32}}>
      <div style={{maxWidth:500,textAlign:"center"}}>
        <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Connection Error</div>
        <div style={{fontSize:13,color:"#666"}}>{error}</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#080810",minHeight:"100vh",color:"#e0e0f0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* NAV */}
      <nav style={{background:"#0d0d1a",borderBottom:"1px solid #141428",padding:"0 28px",display:"flex",alignItems:"center",position:"sticky",top:0,zIndex:200,height:54}}>
        <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:17,color:"#fff",marginRight:32}}>MK<span style={{color:"#F5A020"}}>.</span></div>
        {[["dashboard","Overview"],["pipeline","Pipeline"]].map(([v,lbl])=>(
          <button key={v} onClick={()=>setView(v)} style={{background:"none",border:"none",color:view===v?"#fff":"#44445a",fontFamily:"'DM Sans'",fontSize:13,fontWeight:600,padding:"0 16px",height:54,cursor:"pointer",borderBottom:view===v?"2px solid #F5A020":"2px solid transparent"}}>{lbl}</button>
        ))}
        {saving && <div style={{marginLeft:16,fontSize:11,color:"#F5A020",letterSpacing:"1px"}}>SAVING…</div>}
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {Object.entries(COMPANIES).map(([key,c])=>(
            <button key={key} onClick={()=>setActiveCo(key)} style={{background:activeCo===key?c.color+"cc":"#141422",border:"1px solid "+(activeCo===key?c.accent:"#222235"),color:activeCo===key?"#fff":"#44445a",fontSize:11,fontWeight:700,padding:"5px 14px",borderRadius:20,cursor:"pointer"}}>{c.short}</button>
          ))}
          <button onClick={()=>openAdd(activeCo)} style={{background:"#F5A020",border:"none",color:"#000",fontSize:12,fontWeight:700,padding:"7px 16px",borderRadius:20,cursor:"pointer",marginLeft:4}}>+ Add</button>
        </div>
      </nav>

      <div style={{padding:"32px 28px",maxWidth:1120,margin:"0 auto"}}>

        {/* DASHBOARD */}
        {view==="dashboard" && (
          <div>
            <div style={{background:"linear-gradient(135deg,#0f1428 0%,#1a1500 100%)",border:"1px solid #22200a",borderRadius:16,padding:"32px 36px",marginBottom:24,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-50,right:-50,width:220,height:220,background:"#F5A020",borderRadius:"50%",opacity:0.05,pointerEvents:"none"}}/>
              <div style={{position:"absolute",bottom:-40,right:80,width:150,height:150,background:"#4ECDC4",borderRadius:"50%",opacity:0.04,pointerEvents:"none"}}/>
              <div style={{fontSize:10,color:"#4a4a30",letterSpacing:"3px",textTransform:"uppercase",marginBottom:10}}>Total In Your Pocket</div>
              <div style={{fontFamily:"'Space Grotesk'",fontSize:52,fontWeight:700,color:"#F5A020",lineHeight:1,marginBottom:6}}>{fmtDisplay(totalEarnedAll)}</div>
              <div style={{fontSize:13,color:"#3a3a28",marginBottom:24}}>Base commissions + bonuses · both companies</div>
              <div style={{display:"flex",gap:36,flexWrap:"wrap"}}>
                {[{label:"Revenue Closed",val:fmtDisplay(totalRev),color:"#fff"},{label:"Active Pipeline",val:fmtDisplay(totalPipe),color:"#4ECDC4"},{label:"Total Leads",val:leads.length,color:"#fff"},{label:"Closed Deals",val:leads.filter(l=>l.stage===WON).length,color:"#22c55e"}].map((s,i)=>(
                  <div key={i}>
                    <div style={{fontSize:10,color:"#3a3a28",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>{s.label}</div>
                    <div style={{fontFamily:"'Space Grotesk'",fontSize:22,fontWeight:700,color:s.color}}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              {Object.entries(COMPANIES).map(([key,c])=>{
                const rev=revenue(key),earned=totalEarned(key),base=baseComm(key),bonus=bonusTotal(key),pip=pipeline(key),goal=goals[key],cr=convRate(key),won=wonLeads(key).length,total=cLeads(key).length;
                const stageCounts=RG_STAGES.reduce((acc,s)=>{acc[s]=cLeads(key).filter(l=>l.stage===s).length;return acc;},{});
                return (
                  <div key={key} style={{background:"#0d0d1a",border:"1px solid #181828",borderRadius:16,overflow:"hidden"}}>
                    <div style={{background:"linear-gradient(100deg,"+c.color+" 0%,"+c.color+"99 100%)",padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:15,color:"#fff"}}>{c.name}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>{c.commissionRate*100}% base commission</div>
                      </div>
                      <button onClick={()=>{setActiveCo(key);openAdd(key);}} style={{background:c.accent,border:"none",color:"#000",fontSize:11,fontWeight:700,padding:"6px 14px",borderRadius:20,cursor:"pointer"}}>+ Lead</button>
                    </div>
                    <div style={{padding:"22px 24px"}}>
                      <div style={{background:"#08080f",borderRadius:10,padding:"16px 18px",marginBottom:18,border:"1px solid "+c.accent+"28"}}>
                        <div style={{fontSize:10,color:"#33334a",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Your Pocket</div>
                        <div style={{fontFamily:"'Space Grotesk'",fontSize:30,fontWeight:700,color:c.accent,lineHeight:1,marginBottom:10}}>{fmtDisplay(earned)}</div>
                        <div style={{display:"flex",gap:24}}>
                          <div><div style={{fontSize:10,color:"#2a2a40",marginBottom:2}}>Base ({c.commissionRate*100}%)</div><div style={{fontSize:14,fontWeight:600,color:"#888"}}>{fmtDisplay(base)}</div></div>
                          <div><div style={{fontSize:10,color:"#2a2a40",marginBottom:2}}>Bonuses</div><div style={{fontSize:14,fontWeight:600,color:bonus>0?"#22c55e":"#444"}}>{bonus>0?fmtDisplay(bonus):"—"}</div></div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:18}}>
                        {[{label:"Revenue",val:fmtDisplay(rev)},{label:"Pipeline",val:fmtDisplay(pip),color:"#4ECDC4"},{label:"Close Rate",val:cr+"%",color:cr>40?"#22c55e":cr>20?"#F5A020":"#888"},{label:"Won",val:won,color:"#22c55e"},{label:"Total",val:total}].map(s=>(
                          <div key={s.label} style={{background:"#060610",borderRadius:8,padding:"10px 12px",border:"1px solid #111126"}}>
                            <div style={{fontSize:9,color:"#2a2a42",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:4}}>{s.label}</div>
                            <div style={{fontFamily:"'Space Grotesk'",fontSize:16,fontWeight:700,color:s.color||"#c0c0d8"}}>{s.val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{marginBottom:key==="royal_gardens"?16:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <div style={{fontSize:10,color:"#2a2a42",letterSpacing:"1.5px",textTransform:"uppercase"}}>Revenue Goal</div>
                          {editingGoal===key?(
                            <input defaultValue={goal} autoFocus onBlur={e=>saveGoal(key,e.target.value)} onKeyDown={e=>e.key==="Enter"&&e.target.blur()} style={{background:"#0d0d18",border:"1px solid "+c.accent,borderRadius:4,color:"#fff",padding:"2px 8px",fontSize:11,width:110,outline:"none"}}/>
                          ):(
                            <button onClick={()=>setEditingGoal(key)} style={{background:"none",border:"none",color:"#2a2a40",fontSize:11,cursor:"pointer"}}>{fmtDisplay(goal)} ✎</button>
                          )}
                        </div>
                        <Bar value={rev} max={goal} color={c.accent}/>
                        <div style={{fontSize:10,color:"#22223a",marginTop:4}}>{fmtDisplay(rev)} of {fmtDisplay(goal)} · {goal>0?Math.round((rev/goal)*100):0}%</div>
                      </div>
                      {key==="royal_gardens"&&(
                        <div>
                          <div style={{fontSize:10,color:"#22223a",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8}}>Active Stages</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                            {RG_STAGES.filter(s=>stageCounts[s]>0).map(s=>(
                              <div key={s} style={{display:"flex",alignItems:"center",gap:4,background:STAGE_COLORS[s]+"1a",border:"1px solid "+STAGE_COLORS[s]+"44",borderRadius:4,padding:"3px 8px"}}>
                                <span style={{fontSize:10,color:STAGE_COLORS[s]}}>{s}</span>
                                <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{stageCounts[s]}</span>
                              </div>
                            ))}
                            {cLeads(key).length===0&&<span style={{fontSize:11,color:"#1a1a2e"}}>No leads yet</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {view==="pipeline"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24}}>
              <div>
                <div style={{fontSize:10,color:"#33334a",letterSpacing:"2.5px",textTransform:"uppercase",marginBottom:6}}>{co.name}</div>
                <div style={{fontFamily:"'Space Grotesk'",fontSize:26,fontWeight:700,color:"#fff"}}>{activeCo==="gv_pools"?"Closed Clients":"Lead Pipeline"}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Space Grotesk'",fontSize:24,fontWeight:700,color:co.accent}}>{fmtDisplay(totalEarned(activeCo))}</div>
                <div style={{fontSize:11,color:"#22223a"}}>earned this period</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, email…" style={{...IS,flex:1,minWidth:200,maxWidth:300}}/>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["All",...stages].map(s=>(
                  <button key={s} onClick={()=>setFilterStage(s)} style={{background:filterStage===s?(STAGE_COLORS[s]||co.color)+"33":"#0d0d1a",border:"1px solid "+(filterStage===s?(STAGE_COLORS[s]||co.accent):"#181828"),color:filterStage===s?(STAGE_COLORS[s]||co.accent):"#33334a",fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:6,cursor:"pointer"}}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filtered.length===0&&<div style={{textAlign:"center",color:"#1e1e30",padding:"80px 0",fontSize:14}}>{leads.filter(l=>l.company===activeCo).length===0?"No leads yet — hit + Add to start":"No results"}</div>}
              {filtered.map(lead=>{
                const stageIdx=RG_STAGES.indexOf(lead.stage);
                const bonus=rawNum(lead.bonusRaw);
                return (
                  <div key={lead.id} onClick={()=>{setSelected(lead);setView("detail");}} style={{background:"#0d0d1a",border:"1px solid #181828",borderRadius:10,padding:"16px 20px",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=co.accent+"77";e.currentTarget.style.background="#10101e";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#181828";e.currentTarget.style.background="#0d0d1a";}}>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:15,color:"#e0e0f0",marginBottom:2}}>{lead.name}</div>
                        <div style={{fontSize:12,color:"#2a2a42"}}>{lead.phone||""}{lead.phone&&lead.email?" · ":""}{lead.email||""}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:16,color:lead.stage===WON?"#22c55e":"#e0e0f0"}}>{fmtDisplay(rawNum(lead.valueRaw))}</div>
                        {bonus>0&&<div style={{fontSize:11,color:"#22c55e"}}>+{fmtDisplay(bonus)} bonus</div>}
                        <div style={{fontSize:10,color:"#1e1e30",marginTop:1}}>{fmtDate(lead.date)}</div>
                      </div>
                      <div style={{background:STAGE_COLORS[lead.stage]+"1a",border:"1px solid "+STAGE_COLORS[lead.stage]+"55",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,color:STAGE_COLORS[lead.stage],whiteSpace:"nowrap",minWidth:110,textAlign:"center"}}>{lead.stage}</div>
                    </div>
                    {activeCo==="royal_gardens"&&lead.stage!==LOST&&stageIdx>=0&&<div style={{marginTop:10}}><Bar value={stageIdx} max={RG_STAGES.length-2} color={STAGE_COLORS[lead.stage]}/></div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ADD/EDIT */}
        {view==="add"&&form&&(
          <div>
            <button onClick={()=>{setView("pipeline");setForm(null);}} style={{background:"none",border:"none",color:"#33334a",fontSize:13,cursor:"pointer",marginBottom:24}}>← Back</button>
            <div style={{fontFamily:"'Space Grotesk'",fontSize:24,fontWeight:700,color:"#fff",marginBottom:28}}>{form._edit?"Edit Lead":"New Lead"}</div>
            <div style={{background:"#0d0d1a",border:"1px solid #181828",borderRadius:14,padding:32,maxWidth:620}}>
              <div style={{marginBottom:22}}>
                <label style={LS}>Company</label>
                <div style={{display:"flex",gap:8}}>
                  {Object.entries(COMPANIES).map(([key,c])=>(
                    <button key={key} onClick={()=>setForm(f=>({...f,company:key,stage:key==="gv_pools"?WON:"New Lead"}))} style={{background:form.company===key?c.color:"#141422",border:"1px solid "+(form.company===key?c.accent:"#252538"),color:"#fff",fontSize:13,fontWeight:600,padding:"9px 20px",borderRadius:8,cursor:"pointer",flex:1}}>{c.short}</button>
                  ))}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
                <div style={{gridColumn:"1 / -1"}}><TF label="Client Name *" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="Full name"/></div>
                <TF label="Phone" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))} placeholder="(407) 000-0000"/>
                <TF label="Email" value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} placeholder="client@email.com"/>
                <CurrencyField label="Deal Value" value={form.valueRaw} onChange={v=>setForm(f=>({...f,valueRaw:v}))}/>
                <CurrencyField label={rawNum(form.bonusRaw)>0?"Bonus ✓":"Bonus (Optional)"} value={form.bonusRaw} onChange={v=>setForm(f=>({...f,bonusRaw:v}))}/>
                <TF label="Lead Date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} type="date"/>
                <TF label="Expected Close" value={form.closeDate} onChange={v=>setForm(f=>({...f,closeDate:v}))} type="date"/>
              </div>
              {form.company==="royal_gardens"&&(
                <div style={{marginBottom:18}}>
                  <label style={LS}>Stage</label>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {RG_STAGES.map(s=>(
                      <button key={s} onClick={()=>setForm(f=>({...f,stage:s}))} style={{background:form.stage===s?STAGE_COLORS[s]+"2a":"#0a0a14",border:"1px solid "+(form.stage===s?STAGE_COLORS[s]:"#1e1e30"),color:form.stage===s?STAGE_COLORS[s]:"#2a2a40",fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:6,cursor:"pointer"}}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{marginBottom:22}}>
                <label style={LS}>Notes</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Pool model, backyard scope, budget notes…" rows={3} style={{...IS,resize:"vertical"}}/>
              </div>
              {rawNum(form.valueRaw)>0&&(
                <div style={{background:"#080812",borderRadius:10,padding:"14px 18px",marginBottom:24,border:"1px solid #141428"}}>
                  <div style={{fontSize:10,color:"#22223a",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>Commission Preview</div>
                  <div style={{display:"flex",gap:28,alignItems:"flex-end",flexWrap:"wrap"}}>
                    {[{label:"Base ("+COMPANIES[form.company].commissionRate*100+"%)",val:fmtDisplay(rawNum(form.valueRaw)*COMPANIES[form.company].commissionRate),color:COMPANIES[form.company].accent},...(rawNum(form.bonusRaw)>0?[{label:"Bonus",val:fmtDisplay(rawNum(form.bonusRaw)),color:"#22c55e"}]:[]),{label:"You Earn",val:fmtDisplay(rawNum(form.valueRaw)*COMPANIES[form.company].commissionRate+rawNum(form.bonusRaw)),color:"#fff",big:true}].map(s=>(
                      <div key={s.label}><div style={{fontSize:10,color:"#22223a",marginBottom:2}}>{s.label}</div><div style={{fontFamily:"'Space Grotesk'",fontSize:s.big?22:18,fontWeight:700,color:s.color}}>{s.val}</div></div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={saveForm} disabled={saving} style={{background:COMPANIES[form.company].accent,border:"none",color:"#000",fontSize:14,fontWeight:700,padding:"13px 28px",borderRadius:10,cursor:"pointer",flex:1,opacity:saving?0.7:1}}>{saving?"Saving…":form._edit?"Save Changes":"Add Lead"}</button>
                <button onClick={()=>{setView("pipeline");setForm(null);}} style={{background:"#141422",border:"1px solid #252538",color:"#44445a",fontSize:14,fontWeight:600,padding:"13px 20px",borderRadius:10,cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* DETAIL */}
        {view==="detail"&&selected&&(()=>{
          const c=COMPANIES[selected.company];
          const val=rawNum(selected.valueRaw),bonus=rawNum(selected.bonusRaw),base=val*c.commissionRate,totalE=base+bonus;
          return (
            <div>
              <button onClick={()=>setView("pipeline")} style={{background:"none",border:"none",color:"#33334a",fontSize:13,cursor:"pointer",marginBottom:24}}>← Pipeline</button>
              <div style={{background:"#0d0d1a",border:"1px solid #181828",borderRadius:14,overflow:"hidden",maxWidth:640}}>
                <div style={{background:"linear-gradient(100deg,"+c.color+" 0%,"+c.color+"88 100%)",padding:"22px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontFamily:"'Space Grotesk'",fontSize:22,fontWeight:700,color:"#fff"}}>{selected.name}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:3}}>{c.name}</div>
                  </div>
                  <div style={{background:STAGE_COLORS[selected.stage]+"2a",border:"1px solid "+STAGE_COLORS[selected.stage],borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,color:STAGE_COLORS[selected.stage]}}>{selected.stage}</div>
                </div>
                <div style={{padding:28}}>
                  <div style={{background:"#06060f",borderRadius:10,padding:"18px 20px",marginBottom:22,border:"1px solid "+c.accent+"28"}}>
                    <div style={{fontSize:10,color:"#22223a",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:12}}>Your Earnings on This Deal</div>
                    <div style={{display:"flex",gap:28,flexWrap:"wrap",alignItems:"flex-end"}}>
                      {[{label:"Deal Value",val:fmtDisplay(val),color:"#c0c0d8"},{label:"Base ("+c.commissionRate*100+"%)",val:fmtDisplay(base),color:c.accent},...(bonus>0?[{label:"Bonus",val:fmtDisplay(bonus),color:"#22c55e"}]:[]),{label:"Total Earned",val:fmtDisplay(totalE),color:"#fff",big:true}].map(s=>(
                        <div key={s.label}><div style={{fontSize:10,color:"#22223a",marginBottom:2}}>{s.label}</div><div style={{fontFamily:"'Space Grotesk'",fontSize:s.big?26:20,fontWeight:700,color:s.color}}>{s.val}</div></div>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                    {[{label:"Phone",val:selected.phone||"—"},{label:"Email",val:selected.email||"—"},{label:"Lead Date",val:fmtDate(selected.date)},{label:"Expected Close",val:fmtDate(selected.closeDate)}].map(s=>(
                      <div key={s.label}><div style={{fontSize:10,color:"#22223a",letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>{s.label}</div><div style={{fontSize:14,fontWeight:500,color:"#aaa"}}>{s.val}</div></div>
                    ))}
                  </div>
                  {selected.notes&&<div style={{background:"#060610",borderRadius:8,padding:14,marginBottom:20,border:"1px solid #111126"}}><div style={{fontSize:10,color:"#22223a",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Notes</div><div style={{fontSize:13,color:"#666680",lineHeight:1.7}}>{selected.notes}</div></div>}
                  {selected.company==="royal_gardens"&&(
                    <div style={{marginBottom:22}}>
                      <div style={{fontSize:10,color:"#22223a",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8}}>Move Stage</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {RG_STAGES.map(s=>(
                          <button key={s} onClick={()=>updateStage(selected,s)} style={{background:selected.stage===s?STAGE_COLORS[s]+"2a":"#0a0a14",border:"1px solid "+(selected.stage===s?STAGE_COLORS[s]:"#1a1a28"),color:selected.stage===s?STAGE_COLORS[s]:"#2a2a40",fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:5,cursor:"pointer"}}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>editLead(selected)} style={{background:c.accent,border:"none",color:"#000",fontSize:13,fontWeight:700,padding:"11px 20px",borderRadius:8,cursor:"pointer",flex:1}}>Edit Lead</button>
                    <button onClick={()=>deleteLead(selected.id)} style={{background:"#0f0608",border:"1px solid #251018",color:"#ef4444",fontSize:13,fontWeight:600,padding:"11px 16px",borderRadius:8,cursor:"pointer"}}>Delete</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
