const fs=require('fs'),vm=require('vm');const code=fs.readFileSync('game.js','utf8');
const sc=new Proxy({},{get:(t,p)=>{if(p==='createLinearGradient'||p==='createRadialGradient')return()=>({addColorStop:()=>{}});if(p==='measureText')return()=>({width:10});if(p==='canvas')return{width:375,height:667};return()=>{};}});
const g={console,Math,Date,JSON,Array,Object,String,Number,Boolean,setTimeout,parseInt,parseFloat,isNaN,requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},document:undefined};
g.wx={getSystemInfoSync:()=>({screenWidth:375,screenHeight:667}),onTouchStart:()=>{},onTouchEnd:()=>{},onTouchMove:()=>{},createCanvas:()=>({getContext:()=>sc,width:375,height:667,addEventListener:()=>{}}),createOffscreenCanvas:()=>({getContext:()=>sc,width:100,height:100}),createImage:()=>({src:'',onload:null,onerror:null}),getStorageSync:()=>null,setStorageSync:()=>{},onShow:()=>{},offShow:()=>{},createInnerAudioContext:()=>({play:()=>{},pause:()=>{},stop:()=>{},onEnded:()=>{},destroy:()=>{}})};
const ctx=vm.createContext(g);vm.runInContext(code,ctx,{filename:'game.js'});
function snap(label){
  const idx=vm.runInContext('getPlayerDpsIndex()',ctx);
  const couple=Math.max(1,Math.pow(idx,1.08));
  console.log(label,'idx='+idx.toFixed(2),'dmgCouple='+couple.toFixed(2));
}
snap('开局           ');
// 模拟 12 级火力 + 多重3 + 穿透5 (物理满配)
vm.runInContext('player.damage=10*Math.pow(1.25,12); var m=attributeMods(); m.bulletCountBoost=3; m.pierceBoost=5;',ctx);
snap('物理满配       ');
// 火AOE流: 火力8级 + explosive Lv10
vm.runInContext('player.damage=10*Math.pow(1.25,8); var m=attributeMods(); m.bulletCountBoost=0; m.pierceBoost=0; skills.explosive.level=10;',ctx);
snap('火AOE流        ');
// 闪电链流: 火力8级 + lightning Lv10 + chainBoost 5
vm.runInContext('player.damage=10*Math.pow(1.25,8); skills.explosive.level=0; skills.lightning.level=10; lightningMods().chainCountBoost=5;',ctx);
snap('闪电链流       ');
// 木流: 火力8级 + wood Lv10 + logCountBoost 5
vm.runInContext('player.damage=10*Math.pow(1.25,8); skills.lightning.level=0; skills.wood.level=10; woodMods().logCountBoost=5;',ctx);
snap('木全屏流       ');
// 看一只普通怪在火AOE满配下的实际血量(波20 tier)
vm.runInContext('player.damage=10*Math.pow(1.25,8); var m=attributeMods(); m.bulletCountBoost=0; m.pierceBoost=0; skills.explosive.level=10; skills.wood.level=0; skills.lightning.level=0;');
const hp=vm.runInContext('(function(){var tier=getWaveTier(20);var c=Math.max(1,Math.pow(getPlayerDpsIndex(),1.08));return Math.round(60*1.0*tier.hpT*c);})()',ctx);
console.log('波20 普通怪(火满配) 实际HP =',hp,'(基线60×tier3.4×couple)');
