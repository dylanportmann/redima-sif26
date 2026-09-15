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

  // Garde du soir 22:00-06:00 pour les nuits mercredi->jeudi et jeudi->vendredi.
  const guardPeople=['108','124','114','145','146','147','150','152','151'];
  base.push({id:'manual-guard-wed-thu', title:'GARDE',
    start:2760, end:3240, people:[...guardPeople], post:null,
    source:'Modification demandée', exact:true, override:true});
  base.push({id:'manual-guard-thu-fri', title:'GARDE',
    start:4200, end:4680, people:[...guardPeople], post:null,
    source:'Modification demandée', exact:true, override:true});

  // Poste 32 : Blanc Alan (108) retourne au Pool-pers, Roland Dylan (134) prend sa place.
  for (const e of base) {
    if (e.post === '32' && e.start === 3330 && e.end === 3900 && e.people.includes('108')) {
      e.people = e.people.map(id => id === '108' ? '134' : id);
    }
    if (e.title === 'Pool-pers Halle L' && e.start === 3330 && e.end === 3900 && e.people.includes('134')) {
      e.people = e.people.map(id => id === '134' ? '108' : id);
    }
  }
  // Replace existing early-release timings for the explicitly named people.
  for (const e of base) if (planningPriority(e) === 3) e.people = e.people.filter(id => !releaseIds.includes(id));
  if (releaseIds.length) base.push({id:'manual-release', title:'Licenciement anticipé',
    start:changes.earlyRelease.start, end:changes.earlyRelease.end, people:releaseIds,
    post:null, source:'Modification demandée', exact:true});
  // Giroud Alexandre Florian (ID 143): licenciement dès mardi 15.09.2026 00:00.
  base.push({id:'manual-release-143', title:'Licenciement anticipé',
    start:0, end:5760, people:['143'], post:null,
    source:'Modification demandée', exact:true});
  // Delacuisine Noa Pascal (ID 139): licenciement dès mardi 15.09.2026 12:00.
  base.push({id:'manual-release-139', title:'Licenciement anticipé',
    start:720, end:5760, people:['139'], post:null,
    source:'Modification demandée', exact:true});
  // Oggier Florian Douglas (ID 171): licenciement dès mardi 15.09.2026 12:00.
  base.push({id:'manual-release-171', title:'Licenciement anticipé',
    start:720, end:5760, people:['171'], post:null,
    source:'Modification demandée', exact:true});

  // Remplacements depuis le Pool-pers : reprendre toute la séquence de tâches du poste.
  // Delacuisine -> Monnard Stan (ID 144), poste 10.
  base.push({id:'pool-replacement-10-144-palettes', title:'Palettes',
    start:3690, end:3720, people:['144'], post:null,
    source:'Remplacement Pool-pers - poste 10', exact:true, override:true});
  base.push({id:'pool-replacement-10-144-pret', title:'Prêt',
    start:3720, end:3750, people:['144'], post:null,
    source:'Remplacement Pool-pers - poste 10', exact:true, override:true});
  base.push({id:'pool-replacement-10-144-poste', title:'POSTE 10',
    start:3750, end:3840, people:['144'], post:'10',
    source:'Remplacement Pool-pers - poste 10', exact:true, override:true});

  // Oggier -> Avdéev Ivan (ID 159), poste 40.
  base.push({id:'pool-replacement-40-159-palettes', title:'Palettes',
    start:3270, end:3300, people:['159'], post:null,
    source:'Remplacement Pool-pers - poste 40', exact:true, override:true});
  base.push({id:'pool-replacement-40-159-pret', title:'Prêt',
    start:3300, end:3330, people:['159'], post:null,
    source:'Remplacement Pool-pers - poste 40', exact:true, override:true});
  base.push({id:'pool-replacement-40-159-poste', title:'POSTE 40',
    start:3330, end:3480, people:['159'], post:'40',
    source:'Remplacement Pool-pers - poste 40', exact:true, override:true});
  base.push({id:'pool-replacement-40-159-charg', title:'Charg.',
    start:3480, end:3510, people:['159'], post:null,
    source:'Remplacement Pool-pers - poste 40', exact:true, override:true});
  base.push({id:'pool-replacement-40-159-sgl', title:'SGL',
    start:3540, end:3600, people:['159'], post:null,
    source:'Remplacement Pool-pers - poste 40', exact:true, override:true});

  // Giroud -> Hofer Jérome-Luca (ID 189), poste 33.
  base.push({id:'pool-replacement-33-189-palettes', title:'Palettes',
    start:4770, end:4800, people:['189'], post:null,
    source:'Remplacement Pool-pers - poste 33', exact:true, override:true});
  base.push({id:'pool-replacement-33-189-pret', title:'Prêt',
    start:4800, end:4830, people:['189'], post:null,
    source:'Remplacement Pool-pers - poste 33', exact:true, override:true});
  base.push({id:'pool-replacement-33-189-poste', title:'POSTE 33',
    start:4830, end:4920, people:['189'], post:'33',
    source:'Remplacement Pool-pers - poste 33', exact:true, override:true});

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