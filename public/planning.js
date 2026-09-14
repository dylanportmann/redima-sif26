'use strict';
// Resolve priorities per person, then rebuild shared events for every view.
// Intervals are half-open: a task ending at 18:00 does not overlap a leave starting at 18:00.
function planningPriority(event) {
  const title = event.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/licenciement\s+anticipe/.test(title)) return 3;
  if (/\bconge\b/.test(title)) return 2;
  return event.override ? 1 : 0;
}
function resolvePlanning(events, changes = {}) {
  const releaseIds = changes.earlyRelease?.people || [];
  const base = events.map(e => ({...e, people: [...e.people]}));
  // Replace existing early-release timings for the explicitly named people.
  for (const e of base) if (planningPriority(e) === 3) e.people = e.people.filter(id => !releaseIds.includes(id));
  if (releaseIds.length) base.push({id:'manual-release', title:'Licenciement anticipé',
    start:changes.earlyRelease.start, end:changes.earlyRelease.end, people:releaseIds,
    post:null, source:'Modification demandée', exact:true});
  // Giroud Alexandre Florian (ID 143): licenciement dès mardi 15.09.2026 00:00.
  base.push({id:'manual-release-143', title:'Licenciement anticipé',
    start:0, end:5760, people:['143'], post:null,
    source:'Modification demandée', exact:true});
  for (const change of changes.postAssignments || []) {
    const slots = new Map(base.filter(e => e.post === change.post).map(e => [`${e.start}-${e.end}`,e]));
    for (const e of slots.values()) base.push({...e,id:`manual-post-${change.post}-${e.start}`,people:change.people,override:true,source:'Modification demandée'});
  }
  const byPerson = new Map();
  base.forEach((e,index) => e.people.forEach(id => {
    if (!byPerson.has(id)) byPerson.set(id,[]);
    byPerson.get(id).push({...e,index,priority:planningPriority(e)});
  }));
  const result = new Map();
  for (const [personId, assignments] of byPerson) {
    for (const e of assignments) {
      let pieces = [[e.start,e.end]];
      const blockers = assignments.filter(b => b.priority > e.priority ||
        (e.priority >= 2 && b.priority === e.priority && b.index > e.index));
      for (const b of blockers) pieces = pieces.flatMap(([start,end]) => {
        if (b.start >= end || b.end <= start) return [[start,end]];
        const keep=[];
        if (start < b.start) keep.push([start,b.start]);
        if (b.end < end) keep.push([b.end,end]);
        return keep;
      });
      for (const [start,end] of pieces) {
        if (start >= end) continue;
        const key=`${e.id}/${start}/${end}`;
        if (!result.has(key)) {
          const {index,priority,...source}=e;
          result.set(key,{...source,id:key,start,end,people:[]});
        }
        result.get(key).people.push(personId);
      }
    }
  }
  return [...result.values()];
}
if (typeof module !== 'undefined') module.exports={resolvePlanning,planningPriority};