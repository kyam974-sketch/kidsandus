import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const CHILD_TRAITS = [
  ['🏆','Top student','topstudent'], ['🧠','Smart','smart'], ['🌟','Entusiasta','entusiasta'], ['🦋','In crescita','crescita'],
  ['🥰','Affettuoso','affettuoso'], ['😇','Educato','educato'], ['🐢','Timido','timido'], ['👶','Mammone','mammone'],
  ['😴','Stanco/discontinuo','stanco'], ['📉','In calo','incalo'], ['🎪','Casinista','casinista'], ['💬','Chiacchierone','chiacchierone'],
  ['😑','Svogliato','svogliato'], ['🌫️','Distratto','distratto'], ['😭','Piagnucolone','piagnucolone'], ['😈','Viziato','viziato'],
  ['😠','Maleducato','maleducato'], ['😤','Permaloso','permaloso'], ['😼','Dispettoso','dispettoso'], ['🪨','Non brillante','nonbrillante']
];
const PARENT_TRAITS = [
  ['😊','Sereno','sereno'], ['😤','Permaloso','permaloso'], ['🔍','Pignolo','pignolo'], ['😰','Ansioso','ansioso'], ['🌟','Entusiasta','entusiasta'],
  ['😶','Distaccato','distaccato'], ['💬','Logorroico','logorroico'], ['🤝','Collaborativo','collaborativo'], ['🙈','Negazionista','negazionista'], ['👑','Il bimbo è perfetto','perfetto'], ['📱','Distratto','distratto']
];
function fmtDate(iso){if(!iso)return '';const[y,m,d]=iso.split('-');return `${d}/${m}/${y}`}
function findEntry(s,n){return(s.entries||[]).find(e=>e.name?.toLowerCase()===n.toLowerCase())}
function labelFor(value, traits){return traits.find(([, , v])=>v===value)?.[1]||value}

export default function TermReports(){
  const[groups,setGroups]=useState([]),[sessions,setSessions]=useState([]),[profiles,setProfiles]=useState([]);
  const[student,setStudent]=useState(''),[from,setFrom]=useState('2026-09-15'),[to,setTo]=useState('2026-12-31');
  const[childTraits,setChildTraits]=useState([]),[parentTraits,setParentTraits]=useState([]),[notes,setNotes]=useState(''),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
  const[generating,setGenerating]=useState(false),[generateError,setGenerateError]=useState('');
  const[report,setReport]=useState({participation:'',learning:'',behaviour:''}),[copied,setCopied]=useState(false);

  async function load(){const[{data:g},{data:s},{data:p}]=await Promise.all([supabase.from('group_students').select('*').order('corso'),supabase.from('followup_sessions').select('*').order('session_date',{ascending:true}).limit(3000),supabase.from('term_report_profiles').select('*').order('student_name')]);setGroups(g||[]);setSessions(s||[]);setProfiles(p||[])}
  useEffect(()=>{load()},[]);
  const students=useMemo(()=>Array.from(new Set(groups.flatMap(g=>Array.isArray(g.students)?g.students:[]))).sort((a,b)=>a.localeCompare(b,'it')),[groups]);
  const history=useMemo(()=>student?sessions.filter(s=>findEntry(s,student)&&(!from||s.session_date>=from)&&(!to||s.session_date<=to)):[],[sessions,student,from,to]);

  function chooseStudent(name){setStudent(name);setSaved(false);setGenerateError('');setReport({participation:'',learning:'',behaviour:''});const p=profiles.find(x=>x.student_name?.toLowerCase()===name.toLowerCase());setChildTraits(Array.isArray(p?.child_traits)?p.child_traits:[]);setParentTraits(Array.isArray(p?.parent_traits)?p.parent_traits:[]);setNotes(p?.internal_notes||'')}
  function toggle(v,list,setter){setter(list.includes(v)?list.filter(x=>x!==v):[...list,v]);setSaved(false);setReport({participation:'',learning:'',behaviour:''})}
  async function saveProfile(){if(!student)return;setSaving(true);setSaved(false);const{data:{user}}=await supabase.auth.getUser();const{error}=await supabase.from('term_report_profiles').upsert({user_id:user.id,student_name:student,child_traits:childTraits,parent_traits:parentTraits,internal_notes:notes,updated_at:new Date().toISOString()},{onConflict:'user_id,student_name'});setSaving(false);if(error)alert('Errore salvataggio profilo: '+error.message);else{setSaved(true);await load()}}

  function buildReportPrompt(){
    const childProfile=childTraits.length?childTraits.map(v=>labelFor(v,CHILD_TRAITS)).join(', '):'(none)';
    const parentProfile=parentTraits.length?parentTraits.map(v=>labelFor(v,PARENT_TRAITS)).join(', '):'(none)';
    const evidence=history.map(s=>{const e=findEntry(s,student)||{};return [`${fmtDate(s.session_date)} · ${s.corso||''} · ${s.story||''}`,`Motivation: ${e.motivation??'—'}/5 · Learning: ${e.learning??'—'}/5 · Behaviour: ${e.behaviour??'—'}/5`,e.note?`Follow-up: ${e.note}`:'',e.teacher_note?`Raw teacher note: ${e.teacher_note}`:'',s.group_note?`Group context: ${s.group_note}`:''].filter(Boolean).join('\n')}).join('\n\n');

    return `You are helping me, a Kids&Us teacher in Italy, write a TERM REPORT for ${student} covering ${fmtDate(from)} to ${fmtDate(to)}.

FOLLOW-UP EVIDENCE ACROSS THE PERIOD
${evidence}

INTERNAL CHILD PROFILE — use only to calibrate wording, never quote these labels mechanically
${childProfile}

INTERNAL PARENT PROFILE — use ONLY to calibrate tact and tone; never mention or describe the parent in the report
${parentProfile}

OTHER INTERNAL NOTES
${notes.trim()||'(none)'}

TASK
Write three separate Italian report comments:
1. participation: Partecipazione e motivazione
2. learning: Apprendimento
3. behaviour: Comportamento

STYLE — VERY IMPORTANT
- Write in natural, idiomatic Italian, in MY first-person singular voice as the teacher when expressing observations: "ho notato", "ho visto", "durante le attività ho osservato", "mi sembra più sicuro/a...".
- NEVER write detached phrases such as "l'insegnante segnala", "l'insegnante osserva", "si rileva", "si evidenzia".
- Avoid bureaucratic, clinical, translated or AI-sounding language.
- When referring to songs, say "le canzoni", "cantare", "seguire la canzone" or another normal classroom expression. Do NOT replace "songs" with the unnatural noun "il canto".
- Prefer concrete, everyday classroom Italian over nominalisations and report clichés. Do not overuse "ha dimostrato", "evidenzia", "mostra", "manifesta".
- The report is for families: professional and clear, but warm and human.

CONTENT RULES
- Synthesize the WHOLE selected period. Give more weight to repeated patterns than to one isolated lesson.
- Use the saved follow-ups and raw teacher notes as evidence. Do not invent abilities, incidents, vocabulary, progress or problems.
- Ratings are supporting evidence, not text to reproduce: never mention numbers, scores or emojis.
- Do not simply concatenate old follow-up sentences. Rewrite them into a coherent period-level comment.
- Use concrete examples from lessons only when they genuinely help illustrate a recurring pattern.
- Do not mention internal child-trait labels, parent-trait labels, prompts, AI, or lack of data.
- If evidence is mixed, describe the variation naturally rather than forcing a uniformly positive or negative conclusion.
- Each section should normally be 2-4 sentences and should add distinct information rather than repeating the other sections.

Return ONLY valid JSON exactly in this form:
{"participation":"...","learning":"...","behaviour":"..."}`;
  }

  async function generateReport(){
    setGenerateError('');
    if(!student){setGenerateError('Seleziona prima un allievo.');return}
    if(!history.length){setGenerateError('Non ci sono follow-up nel periodo selezionato.');return}
    setGenerating(true);
    try{
      const resp=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-sol',reasoning_effort:'medium',max_tokens:3500,messages:[{role:'user',content:buildReportPrompt()}]})});
      const data=await resp.json();
      const raw=(data.content||[]).map(b=>b.text||'').join('').replace(/```json|```/g,'').trim();
      if(!raw)throw new Error(data.error?.message||data.error||'Risposta AI vuota');
      const parsed=JSON.parse(raw);
      setReport({participation:String(parsed.participation||''),learning:String(parsed.learning||''),behaviour:String(parsed.behaviour||'')});
    }catch(e){setGenerateError('Errore generazione: '+e.message)}
    setGenerating(false);
  }

  function copyReport(){const text=[`Partecipazione e motivazione\n${report.participation}`,`Apprendimento\n${report.learning}`,`Comportamento\n${report.behaviour}`].join('\n\n');navigator.clipboard.writeText(text.trim());setCopied(true);setTimeout(()=>setCopied(false),1800)}

  return <Layout><div className="page-head"><div><h1>Term Reports</h1><p>Profilo bambino e genitore collegato automaticamente allo storico Follow-up.</p></div></div>
    <div className="tr-card"><h2>1. Bambino</h2><div className="tr-form"><label>Allievo<select value={student} onChange={e=>chooseStudent(e.target.value)}><option value="">Seleziona…</option>{students.map(n=><option key={n}>{n}</option>)}</select></label><label>Periodo<div className="dates"><input type="date" value={from} onChange={e=>{setFrom(e.target.value);setReport({participation:'',learning:'',behaviour:''})}}/><input type="date" value={to} onChange={e=>{setTo(e.target.value);setReport({participation:'',learning:'',behaviour:''})}}/></div></label></div>{student&&<div className="status"><strong>{history.length} follow-up agganciati</strong> nel periodo selezionato.</div>}</div>
    {student&&<><TraitCard title="2. Come è il bambino?" hint="Selezione multipla. Guida i commenti ma non compare letteralmente nel report." traits={CHILD_TRAITS} selected={childTraits} onToggle={v=>toggle(v,childTraits,setChildTraits)}/><TraitCard title="3. Come è il genitore?" hint="Puoi lasciare tutto vuoto se non lo conosci ancora. Serve a calibrare il tono, non i fatti." traits={PARENT_TRAITS} selected={parentTraits} onToggle={v=>toggle(v,parentTraits,setParentTraits)}/>
    <div className="tr-card"><label>Note integrative interne<textarea rows={4} value={notes} onChange={e=>{setNotes(e.target.value);setSaved(false);setReport({participation:'',learning:'',behaviour:''})}} placeholder="Informazioni utili per tono e contesto…"/></label><button className="tr-save" onClick={saveProfile} disabled={saving}>{saving?'Salvataggio…':'Salva profilo'}</button>{saved&&<span className="ok"> ✓ Salvato</span>}</div>
    <div className="tr-card"><h2>4. Storico per il Term Report</h2>{history.length===0?<p className="muted">Nessun follow-up nel periodo selezionato.</p>:history.map(s=>{const e=findEntry(s,student);return <div className="hist" key={s.id}><strong>{fmtDate(s.session_date)} · {s.corso||''} · {s.story||''}</strong><div className="muted">Motivation {e?.motivation??'—'} · Learning {e?.learning??'—'} · Behaviour {e?.behaviour??'—'}</div>{e?.note&&<p>{e.note}</p>}{e?.teacher_note&&<small>Nota docente: {e.teacher_note}</small>}</div>})}</div>
    <div className="tr-card"><h2>5. Commenti Term Report</h2><p className="muted">Generati dallo storico sopra e dal profilo interno. Puoi modificarli prima di copiarli.</p><button className="tr-save" onClick={generateReport} disabled={generating||history.length===0}>{generating?'Generazione…':'Genera Term Report con AI'}</button>{generateError&&<div className="tr-error">{generateError}</div>}{(report.participation||report.learning||report.behaviour)&&<div className="report-fields"><label>Partecipazione e motivazione<textarea rows={5} value={report.participation} onChange={e=>setReport({...report,participation:e.target.value})}/></label><label>Apprendimento<textarea rows={5} value={report.learning} onChange={e=>setReport({...report,learning:e.target.value})}/></label><label>Comportamento<textarea rows={5} value={report.behaviour} onChange={e=>setReport({...report,behaviour:e.target.value})}/></label><button className="tr-save" onClick={copyReport}>{copied?'Copiato ✓':'Copia tutto'}</button></div>}</div></>}
    <style jsx global>{`.tr-card{background:#fff;border:1px solid #e6e0d8;border-radius:16px;padding:22px;margin-bottom:18px}.tr-card h2{margin:0 0 8px;font-size:18px}.tr-form{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tr-card label{font-weight:600;font-size:13px}.tr-card select,.tr-card input,.tr-card textarea{width:100%;margin-top:6px;border:1px solid #d9d3cc;border-radius:9px;padding:10px;font:inherit;background:#fff}.dates{display:flex;gap:8px}.status{margin-top:16px;padding:12px 14px;border-radius:10px;background:#eef7f1;color:#315f43}.trait-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.trait{border:1px solid #ded8d0;background:#fff;border-radius:11px;padding:10px 6px;cursor:pointer;font:inherit}.trait span{display:block;font-size:20px}.trait.selected{border-color:#d4714a;background:#fff5f0}.muted{color:#746d66}.tr-save{margin-top:14px;border:0;border-radius:10px;padding:11px 18px;background:#222;color:#fff;font-weight:700}.tr-save:disabled{opacity:.55}.ok{margin-left:10px;color:#267044}.hist{padding:13px 0;border-top:1px solid #eee}.hist p{margin:7px 0}.report-fields{display:grid;gap:14px;margin-top:18px}.tr-error{margin-top:12px;color:#a13d32;font-weight:600}@media(max-width:800px){.tr-form,.trait-grid{grid-template-columns:1fr 1fr}}`}</style>
  </Layout>
}
function TraitCard({title,hint,traits,selected,onToggle}){return <div className="tr-card"><h2>{title}</h2><p className="muted">{hint}</p><div className="trait-grid">{traits.map(([emoji,label,value])=><button type="button" key={value} className={`trait${selected.includes(value)?' selected':''}`} onClick={()=>onToggle(value)}><span>{emoji}</span>{label}</button>)}</div></div>}
