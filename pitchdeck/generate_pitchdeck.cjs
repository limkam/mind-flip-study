const pptxgen = require('pptxgenjs');
const path = require('path');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'MindFlip';
pptx.subject = 'MindFlip product pitch deck';
pptx.title = 'MindFlip — Turn content into confidence';
pptx.company = 'MindFlip';
pptx.lang = 'en-US';
pptx.theme = {
  headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US'
};
pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: 'F6F5FA' },
  objects: [
    { text: { text: 'MINDFLIP', options: { x: 0.55, y: 7.08, w: 1.4, h: 0.18, fontFace: 'Aptos', fontSize: 8, bold: true, color: '8B8499', charSpacing: 1.6, margin: 0 } } },
    { line: { x: 11.88, y: 7.16, w: 0.86, h: 0, line: { color: 'DCD8E8', width: 1 } } },
  ],
  slideNumber: { x: 12.78, y: 7.06, w: 0.22, h: 0.2, fontFace: 'Aptos', fontSize: 8, color: '8B8499', align: 'right', margin: 0 }
});

const C = { ink:'17121F', muted:'6F687A', violet:'7447E8', violet2:'9B7AF2', pink:'EC3D94', cream:'F6F5FA', white:'FFFFFF', border:'DED9E8', dark:'20152E', green:'2BAE83', orange:'F5A623', blue:'2E94E8', lavender:'EDE7FF' };
const logo = path.resolve(__dirname, '../public/mindflip-logo-wordmark.png');
const icon = path.resolve(__dirname, '../public/mindflip-icon.png');
const hero = path.resolve(__dirname, '../public/login-learning-hero.webp');

function tx(slide, text, x,y,w,h,size=18,color=C.ink,opts={}) {
  slide.addText(text,{x,y,w,h,fontFace:opts.fontFace||'Aptos',fontSize:size,color,bold:!!opts.bold,breakLine: false,margin:0,valign:opts.valign||'mid',align:opts.align||'left',fit:'shrink',charSpacing:opts.charSpacing||0,bullet:opts.bullet,paraSpaceAfterPt:opts.paraSpaceAfterPt||0,isTextBox:true});
}
function title(slide, kicker, headline, sub) {
  tx(slide,kicker.toUpperCase(),0.65,0.48,3.5,0.25,10,C.violet,{bold:true,charSpacing:1.8});
  tx(slide,headline,0.65,0.86,11.9,0.75,29,C.ink,{bold:true});
  if(sub) tx(slide,sub,0.65,1.62,11.5,0.48,13,C.muted,{});
}
function roundRect(slide,x,y,w,h,fill=C.white,r=0.16,line=C.border){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:r,fill:{color:fill},line:{color:line,width:1},radius:r});
}
function pill(slide,text,x,y,w,color=C.violet,fill='EDE7FF'){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h:0.35,rectRadius:0.17,fill:{color:fill},line:{color:fill},radius:0.17});
  tx(slide,text,x,y,w,0.35,10,color,{bold:true,align:'center'});
}
function dot(slide,x,y,color=C.violet,r=0.12){slide.addShape(pptx.ShapeType.ellipse,{x,y,w:r,h:r,fill:{color},line:{color}})}
function addNotes(slide, note){ slide.addNotes(note); }

// 1 — Cover
{
  const s=pptx.addSlide(); s.background={color:C.dark};
  s.addShape(pptx.ShapeType.ellipse,{x:8.0,y:-2.2,w:7.0,h:7.0,fill:{color:C.violet,transparency:12},line:{color:C.violet,transparency:100}});
  s.addShape(pptx.ShapeType.ellipse,{x:9.7,y:3.2,w:4.8,h:4.8,fill:{color:C.pink,transparency:22},line:{color:C.pink,transparency:100}});
  s.addImage({path:logo,x:0.7,y:0.55,w:2.75,h:0.82,transparency:0});
  pill(s,'PRODUCT PITCH',0.72,1.72,1.55,'E7DFFF','573A82');
  tx(s,'Turn content into\nconfidence.',0.72,2.3,7.2,1.75,42,C.white,{bold:true});
  tx(s,'The AI-powered study platform that converts books into adaptive practice—and keeps learners coming back.',0.75,4.28,6.5,1.0,18,'DAD3E6',{});
  tx(s,'Learn smarter. Remember longer.',0.75,6.45,4.7,0.35,12,'BBAFD0',{bold:true});
  // floating study cards
  roundRect(s,8.15,1.20,3.85,1.30,'FFFFFF',0.16,'FFFFFF');
  pill(s,'AI-GENERATED',8.42,1.42,1.35,C.violet,C.lavender);
  tx(s,'What drives photosynthesis?',8.42,1.88,3.05,0.32,15,C.ink,{bold:true});
  roundRect(s,8.78,2.88,3.85,1.38,'FFFFFF',0.16,'FFFFFF');
  tx(s,'Daily review',9.05,3.12,1.8,0.24,12,C.muted,{bold:true});
  tx(s,'12 cards due',9.05,3.46,2.0,0.38,22,C.ink,{bold:true});
  pill(s,'START',11.25,3.43,0.92,C.white,C.violet);
  roundRect(s,8.05,4.86,3.95,1.10,'FFFFFF',0.16,'FFFFFF');
  tx(s,'7 day streak',8.38,5.08,2.1,0.26,14,C.ink,{bold:true});
  for(let i=0;i<7;i++) dot(s,8.4+i*0.42,5.52,i<6?C.orange:'D9D4DF',0.18);
  addNotes(s,'Open with the core promise: MindFlip does not just organize learning content. It transforms content into repeated, measurable practice that builds confidence.');
}

// 2 — Problem
{
  const s=pptx.addSlide('MASTER'); title(s,'The problem','More content has not created better learning.','Learners are surrounded by information—but still struggle to turn it into durable knowledge.');
  const items=[
    ['01','Passive consumption','Reading and highlighting feel productive, but rarely create enough retrieval practice.'],
    ['02','Fragmented tools','Notes, flashcards, quizzes, games and analytics live in separate products and workflows.'],
    ['03','Motivation decays','Without visible progress, timely reminders and social momentum, consistency disappears.']
  ];
  items.forEach((it,i)=>{const y=2.45+i*1.27; tx(s,it[0],0.72,y,0.52,0.42,21,i===0?C.violet:i===1?C.pink:C.green,{bold:true}); tx(s,it[1],1.48,y,2.75,0.38,17,C.ink,{bold:true}); tx(s,it[2],4.2,y,7.8,0.52,14,C.muted,{}); s.addShape(pptx.ShapeType.line,{x:0.72,y:y+0.83,w:11.55,h:0,line:{color:C.border,width:1}})});
  roundRect(s,0.72,6.33,11.55,0.52,C.dark,0.16,C.dark); tx(s,'The gap is not access to information. It is turning information into a habit of active recall.',1.02,6.33,11.0,0.52,15,C.white,{bold:true,align:'center'});
  addNotes(s,'Frame the problem around behavior, not content scarcity. The product wins by collapsing multiple learning jobs into one reinforcing loop.');
}

// 3 — Solution loop
{
  const s=pptx.addSlide('MASTER'); title(s,'The solution','One continuous loop from source material to mastery.','MindFlip removes setup friction, adapts practice, and makes progress visible.');
  const steps=[['1','ADD','Upload a book or learning material',C.violet],['2','CREATE','Generate cards, summaries & quizzes',C.pink],['3','PRACTICE','Review, play and test recall',C.blue],['4','ADAPT','Prioritize weak topics automatically',C.green],['5','GROW','Track streaks, scores & achievements',C.orange]];
  steps.forEach((a,i)=>{const x=0.55+i*2.52; roundRect(s,x,2.55,2.18,2.55,C.white,0.18,C.border); slide=s; slide.addShape(pptx.ShapeType.ellipse,{x:x+0.71,y:2.88,w:0.72,h:0.72,fill:{color:a[4]},line:{color:a[4]}}); tx(s,a[0],x+0.71,2.88,0.72,0.72,19,C.white,{bold:true,align:'center'}); tx(s,a[1],x+0.22,3.82,1.74,0.26,11,a[4],{bold:true,align:'center',charSpacing:1.3}); tx(s,a[2],x+0.22,4.24,1.74,0.62,13,C.ink,{bold:true,align:'center'}); if(i<4){tx(s,'→',x+2.22,3.46,0.28,0.4,20,C.muted,{bold:true,align:'center'})}});
  tx(s,'Less time building a study system.',1.0,5.72,5.25,0.43,21,C.ink,{bold:true,align:'center'}); tx(s,'More time actually learning.',7.05,5.72,5.0,0.43,21,C.violet,{bold:true,align:'center'});
  addNotes(s,'Walk left to right. The key differentiator is continuity: MindFlip closes the loop between generation, practice, performance data and the next best action.');
}

// 4 — AI engine
{
  const s=pptx.addSlide('MASTER'); title(s,'Feature spotlight','Your content becomes an instant study system.','AI handles the heavy setup work while the learner stays in control.');
  s.addImage({path:hero,x:0.65,y:2.25,w:5.55,h:3.88});
  s.addShape(pptx.ShapeType.roundRect,{x:0.9,y:4.96,w:4.95,h:0.82,rectRadius:0.15,fill:{color:C.dark,transparency:5},line:{color:C.dark,transparency:100}});
  tx(s,'Upload once. Practice in multiple ways.',1.17,5.13,4.43,0.45,17,C.white,{bold:true,align:'center'});
  const fs=[['Smart ingestion','Upload books, edit the table of contents and organize a reusable library.'],['Multi-format generation','Create flashcards, summaries, scenarios and quizzes from selected chapters.'],['Asynchronous workflow','Keep moving while generation runs, with progress and status visible.'],['Regenerate with intent','Refresh scenarios or focus practice on the material that matters now.']];
  fs.forEach((f,i)=>{const y=2.24+i*1.02; dot(s,6.65,y+0.13,[C.violet,C.pink,C.blue,C.green][i],0.18); tx(s,f[0],7.02,y,2.3,0.30,15,C.ink,{bold:true}); tx(s,f[1],7.02,y+0.33,5.15,0.52,12.5,C.muted,{})});
  addNotes(s,'This is the activation moment: a learner brings material they already need to understand, and MindFlip turns it into structured practice without manual card creation.');
}

// 5 — Adaptive practice
{
  const s=pptx.addSlide('MASTER'); title(s,'Feature spotlight','Practice that changes with the learner.','Every interaction becomes a signal for what to review next.');
  // central mock card
  roundRect(s,4.54,2.30,4.25,3.42,C.white,0.22,'CDC4E3'); pill(s,'CARD 08 / 24',4.87,2.64,1.22,C.violet,C.lavender); tx(s,'Explain the difference between\nmitosis and meiosis.',4.87,3.22,3.55,0.85,20,C.ink,{bold:true,align:'center'}); tx(s,'Tap to reveal answer',5.42,4.30,2.45,0.26,11,C.muted,{align:'center'});
  [['Again',C.pink],['Hard',C.orange],['Good',C.green],['Easy',C.violet]].forEach((a,i)=>pill(s,a[0],4.82+i*0.91,4.90,0.78,C.white,a[1]));
  const left=[['Spaced repetition','Schedules review based on memory strength.'],['Daily review','Surfaces due cards in one focused queue.']];
  const right=[['Weak-topic detection','Uses quiz performance to highlight gaps.'],['Offline progress','Keeps study moving and syncs when connected.']];
  left.forEach((f,i)=>{roundRect(s,0.68,2.55+i*1.55,3.1,1.10,C.white,0.16,C.border); tx(s,f[0],0.94,2.75+i*1.55,2.56,0.28,15,C.ink,{bold:true}); tx(s,f[1],0.94,3.08+i*1.55,2.56,0.38,12,C.muted,{})});
  right.forEach((f,i)=>{roundRect(s,9.54,2.55+i*1.55,3.1,1.10,C.white,0.16,C.border); tx(s,f[0],9.80,2.75+i*1.55,2.56,0.28,15,C.ink,{bold:true}); tx(s,f[1],9.80,3.08+i*1.55,2.56,0.38,12,C.muted,{})});
  addNotes(s,'Emphasize that MindFlip is not a static content generator. Ratings, quiz results and review timing continuously shape the next session.');
}

// 6 — engagement
{
  const s=pptx.addSlide('MASTER'); title(s,'Feature spotlight','Learning people want to return to.','Motivation is designed into the experience—not bolted on afterward.');
  const cards=[
    ['🔥','STREAKS','Turn consistency into a visible daily win.',C.orange],
    ['🏆','ACHIEVEMENTS','Celebrate meaningful milestones and mastery.',C.violet],
    ['⚔','CHALLENGES','Invite peers, compare results and create urgency.',C.pink],
    ['🎮','STUDY GAMES','Practice through memory match, lightning rounds, RPG battles and more.',C.blue],
    ['👥','GROUPS','Set shared goals, collect materials and learn together.',C.green],
    ['📊','SCORECARDS','Package progress into a clear, shareable story.',C.dark]
  ];
  cards.forEach((a,i)=>{const col=i%3,row=Math.floor(i/3),x=0.66+col*4.18,y=2.36+row*1.82; roundRect(s,x,y,3.78,1.47,C.white,0.18,C.border); tx(s,a[0],x+0.24,y+0.20,0.55,0.45,24,a[4],{align:'center'}); tx(s,a[1],x+0.92,y+0.18,2.48,0.29,12,a[4],{bold:true,charSpacing:1.1}); tx(s,a[2],x+0.92,y+0.54,2.52,0.62,12.5,C.muted,{})});
  tx(s,'The outcome: a stronger habit loop—cue, practice, reward, repeat.',1.3,6.21,10.75,0.42,18,C.ink,{bold:true,align:'center'});
  addNotes(s,'These features serve the learning habit. They provide different reasons to return: personal progress, fun, friendly competition and accountability.');
}

// 7 — role value
{
  const s=pptx.addSlide('MASTER'); title(s,'Value','One platform. Clear value for every learning stakeholder.','A shared system connects individual practice with the people supporting it.');
  const cols=[
    ['LEARNERS','Study faster','Turn required reading into active practice; know what to review; stay motivated.',['AI study sets','Daily review','Games & streaks'],C.violet],
    ['EDUCATORS','See the gaps','Track outcomes, guide attention and support learners with evidence—not guesswork.',['Analytics','Groups','Scorecards'],C.pink],
    ['ORGANIZATIONS','Scale support','Offer a consistent learning workflow across users, content and devices.',['User management','Shared goals','Mobile + web'],C.green]
  ];
  cols.forEach((c,i)=>{const x=0.68+i*4.2; roundRect(s,x,2.32,3.78,3.75,C.white,0.2,C.border); s.addShape(pptx.ShapeType.rect,{x:x,y:2.32,w:3.78,h:0.10,fill:{color:c[4]},line:{color:c[4]}}); tx(s,c[0],x+0.27,2.66,3.22,0.25,11,c[4],{bold:true,charSpacing:1.4}); tx(s,c[1],x+0.27,3.09,3.22,0.38,22,C.ink,{bold:true}); tx(s,c[2],x+0.27,3.55,3.22,0.88,13,C.muted,{}); c[3].forEach((p,j)=>{dot(s,x+0.30,4.75+j*0.36,c[4],0.12);tx(s,p,x+0.55,4.66+j*0.36,2.72,0.28,11.5,C.ink,{bold:true})})});
  addNotes(s,'This slide broadens the value story without inventing a market size. The same core loop serves individual learners and gives educators or organizations more visibility and consistency.');
}

// 8 — differentiation
{
  const s=pptx.addSlide('MASTER'); title(s,'Why MindFlip','The difference is the connected system.','Most tools solve one moment. MindFlip connects the entire learning journey.');
  const rows=[['Bring your own material','●','○','○'],['AI-generated practice','●','●','○'],['Adaptive daily review','●','○','●'],['Quizzes + multiple games','●','○','○'],['Challenges, groups & leaderboards','●','○','○'],['Analytics + shareable scorecards','●','○','○'],['Installable, offline-capable experience','●','○','○']];
  const xs=[0.75,7.05,8.75,10.65];
  tx(s,'CAPABILITY',xs[0],2.30,5.3,0.30,11,C.muted,{bold:true,charSpacing:1.4}); tx(s,'MINDFLIP',xs[1],2.30,1.45,0.30,11,C.violet,{bold:true,align:'center'}); tx(s,'AI CONTENT\nGENERATORS',xs[2],2.20,1.55,0.48,9.5,C.muted,{bold:true,align:'center'}); tx(s,'FLASHCARD\nTOOLS',xs[3],2.20,1.55,0.48,9.5,C.muted,{bold:true,align:'center'});
  rows.forEach((r,i)=>{const y=2.82+i*0.48;if(i%2===0)s.addShape(pptx.ShapeType.rect,{x:0.68,y:y-0.03,w:11.98,h:0.43,fill:{color:'F0EDF5'},line:{color:'F0EDF5'}});tx(s,r[0],0.85,y,5.8,0.30,12.5,C.ink,{bold:i<2}); tx(s,r[1],7.05,y,1.45,0.30,15,C.violet,{bold:true,align:'center'});tx(s,r[2],8.75,y,1.55,0.30,15,'AAA3B4',{align:'center'});tx(s,r[3],10.65,y,1.55,0.30,15,'AAA3B4',{align:'center'})});
  pill(s,'CONNECTED EXPERIENCE',4.95,6.40,3.42,C.white,C.dark);
  addNotes(s,'The comparison is category-level, not a claim about named competitors. MindFlip combines generation, adaptation, engagement and insight in one experience.');
}

// 9 — architecture / proof
{
  const s=pptx.addSlide('MASTER'); title(s,'Built to deliver','A product foundation ready for real learning behavior.','MindFlip pairs a polished learner experience with the operational capabilities needed to grow.');
  const layers=[
    ['EXPERIENCE','Responsive web + installable PWA','Mobile-aware navigation • dark mode • offline progress',C.violet],
    ['LEARNING ENGINE','Content generation + adaptive practice','Chapter-aware generation • spaced repetition • weak-topic insights',C.pink],
    ['ENGAGEMENT','Motivation + community loops','Notifications • streaks • achievements • challenges • groups',C.orange],
    ['OPERATIONS','Plans, usage and observability','Entitlements • credits • billing • admin analytics • automation',C.green]
  ];
  layers.forEach((l,i)=>{const y=2.25+i*1.05; roundRect(s,0.72,y,11.78,0.82,i===0?'EEE8FF':C.white,0.13,i===0?'CFC0FA':C.border); tx(s,l[0],0.98,y+0.14,1.45,0.24,10,l[3],{bold:true,charSpacing:1.1});tx(s,l[1],2.55,y+0.12,3.40,0.28,15,C.ink,{bold:true});tx(s,l[2],6.10,y+0.12,5.95,0.50,12,C.muted,{})});
  tx(s,'Designed for the full lifecycle: activate → learn → retain → expand.',1.22,6.54,10.75,0.36,17,C.ink,{bold:true,align:'center'});
  addNotes(s,'This is a product-readiness slide, not a technical deep dive. It shows that MindFlip supports the learning experience and the commercial/operational systems behind it.');
}

// 10 — close
{
  const s=pptx.addSlide(); s.background={color:C.dark};
  s.addShape(pptx.ShapeType.ellipse,{x:-2.2,y:3.8,w:6.0,h:6.0,fill:{color:C.violet,transparency:28},line:{color:C.violet,transparency:100}});
  s.addShape(pptx.ShapeType.ellipse,{x:9.2,y:-2.0,w:5.4,h:5.4,fill:{color:C.pink,transparency:30},line:{color:C.pink,transparency:100}});
  s.addImage({path:icon,x:0.68,y:0.58,w:0.72,h:0.72}); tx(s,'MINDFLIP',1.58,0.69,2.0,0.38,17,C.white,{bold:true,charSpacing:1.8});
  tx(s,'Make every study\nsession count.',0.75,1.75,7.4,1.65,39,C.white,{bold:true});
  tx(s,'Transform content into practice.\nTransform practice into confidence.',0.78,3.72,6.35,0.90,20,'DAD3E6',{});
  roundRect(s,8.25,1.72,3.95,3.98,'FFFFFF',0.25,'FFFFFF');
  pill(s,'THE MINDFLIP PROMISE',8.65,2.13,2.75,C.violet,C.lavender);
  tx(s,'Less setup.',8.65,2.82,3.08,0.40,23,C.ink,{bold:true});
  tx(s,'Smarter practice.',8.65,3.42,3.08,0.40,23,C.ink,{bold:true});
  tx(s,'Visible progress.',8.65,4.02,3.08,0.40,23,C.ink,{bold:true});
  s.addShape(pptx.ShapeType.line,{x:8.65,y:4.76,w:3.02,h:0,line:{color:C.border,width:1}});
  tx(s,'Ready to flip the way learning works?',8.65,4.98,3.00,0.42,13,C.violet,{bold:true,align:'center'});
  tx(s,'Product pitch • 2026',0.78,6.72,2.5,0.28,10,'BBAFD0',{bold:true});
  addNotes(s,'Close on the simple value proposition. Invite the audience into the next conversation: pilot, partnership, investment or product demo.');
}

pptx.writeFile({ fileName: path.resolve(__dirname, 'MindFlip_Pitch_Deck.pptx') });
