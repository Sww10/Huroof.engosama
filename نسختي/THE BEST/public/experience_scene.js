// ═══════════════════════════════════════════════════════════════
// experience_scene.js — "حروف مع أسامة رمضان 2026" — ULTRA PREMIUM
// Photorealistic studio matching broadcast-quality reference design
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';
    const ARABIC = ['أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','هـ','و','ي'];
    // === Premium Color Palette ===
    const PAL = {
        GREEN_DARK: 0x0a2e18, GREEN_MID: 0x1a5a30, GREEN_NEON: 0x22c55e, GREEN_GLOW: 0x00ff6a,
        ORANGE_DARK: 0x3d1f08, ORANGE_MID: 0x7a3d10, ORANGE_NEON: 0xf97316, ORANGE_GLOW: 0xff8c2a,
        WOOD_DARK: 0x3a2818, WOOD_MID: 0x5a3d24, WOOD_LIGHT: 0x8a6a44, GOLD: 0xd4a530, GOLD_BRIGHT: 0xffd700,
        BLACK: 0x0a0a0c, DARK: 0x111114, GREY: 0x1a1a1e, BG: 0x050508,
    };
    let scene, camera, renderer, clock, controls;
    let hexMeshes = {}, buzzerMeshes = [];
    let socket, roomId;
    let moveF=false, moveB=false, moveL=false, moveR=false;
    let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
    let raycaster = new THREE.Raycaster();
    const params = new URLSearchParams(window.location.search);
    roomId = params.get('room') || 'public';
    const loadBar = document.getElementById('loadBar');
    function setLoad(p){ if(loadBar) loadBar.style.width=p+'%'; }

    // === Procedural Texture Generators ===
    function noiseMap(sz, rMin, rMax, bump){
        const c=document.createElement('canvas'); c.width=sz; c.height=sz;
        const ctx=c.getContext('2d'), d=ctx.createImageData(sz,sz);
        for(let i=0;i<d.data.length;i+=4){
            let v=Math.random()*255*0.8+20; if(bump)v=v*0.5+127;
            v=rMin+(v/255)*(rMax-rMin);
            d.data[i]=v;d.data[i+1]=v;d.data[i+2]=v;d.data[i+3]=255;
        }
        ctx.putImageData(d,0,0);
        const t=new THREE.CanvasTexture(c);
        t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4); t.anisotropy=16; return t;
    }
    function woodMap(sz){
        const c=document.createElement('canvas'); c.width=sz; c.height=sz;
        const ctx=c.getContext('2d'), d=ctx.createImageData(sz,sz);
        for(let i=0;i<d.data.length;i+=4){
            const y=Math.floor((i/4)/sz);
            let v=Math.sin(y*0.05+Math.random()*2)*20+100+Math.random()*30;
            d.data[i]=v; d.data[i+1]=v*0.75; d.data[i+2]=v*0.5; d.data[i+3]=255;
        }
        ctx.putImageData(d,0,0);
        const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,2); return t;
    }
    function islamicPatternMap(sz){
        const c=document.createElement('canvas'); c.width=sz; c.height=sz;
        const ctx=c.getContext('2d');
        ctx.fillStyle='#1a1008'; ctx.fillRect(0,0,sz,sz);
        ctx.strokeStyle='#8a6a34'; ctx.lineWidth=2;
        const cell=sz/8;
        for(let x=0;x<8;x++) for(let y=0;y<8;y++){
            const cx=x*cell+cell/2, cy=y*cell+cell/2, r=cell*0.4;
            ctx.beginPath();
            for(let i=0;i<8;i++){const a=Math.PI/4*i; ctx.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r);}
            ctx.closePath(); ctx.stroke();
            ctx.beginPath();
            for(let i=0;i<8;i++){const a=Math.PI/4*i+Math.PI/8; ctx.lineTo(cx+Math.cos(a)*r*0.6, cy+Math.sin(a)*r*0.6);}
            ctx.closePath(); ctx.stroke();
        }
        const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); return t;
    }
    function hexShape(r, rot){
        const s=new THREE.Shape(), off=rot?Math.PI/2:0;
        for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6+off; i===0?s.moveTo(Math.cos(a)*r,Math.sin(a)*r):s.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
        s.closePath(); return s;
    }

    // === Logo Textures ===
    function logoTex(){
        const c=document.createElement('canvas'); c.width=1024; c.height=1024;
        const ctx=c.getContext('2d'); ctx.textAlign='center'; ctx.textBaseline='middle';
        const g=ctx.createLinearGradient(0,200,0,800);
        g.addColorStop(0,'#fef08a'); g.addColorStop(0.3,'#d4a530'); g.addColorStop(0.7,'#b8860b'); g.addColorStop(1,'#8a6a44');
        ctx.font='bold 220px "Tajawal",Arial,sans-serif';
        ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=40; ctx.shadowOffsetX=10; ctx.shadowOffsetY=15;
        ctx.strokeStyle='#1a0a00'; ctx.lineWidth=12; ctx.strokeText('حروف',512,330); ctx.fillStyle=g; ctx.fillText('حروف',512,330);
        ctx.font='bold 150px "Tajawal",Arial,sans-serif';
        ctx.strokeText('مع أسامة',512,580); ctx.fillText('مع أسامة',512,580);
        // Decorative line
        ctx.strokeStyle='#d4a530'; ctx.lineWidth=3; ctx.shadowBlur=0;
        ctx.beginPath(); ctx.moveTo(256,700); ctx.lineTo(768,700); ctx.stroke();
        ctx.font='bold 90px "Tajawal",Arial,sans-serif'; ctx.fillStyle='#fffbeb';
        ctx.fillText('رمضان 2026',512,800);
        const t=new THREE.CanvasTexture(c); t.anisotropy=16; return t;
    }
    function teamNameTex(name, color){
        const c=document.createElement('canvas'); c.width=512; c.height=128;
        const ctx=c.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,512,128);
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 64px "Tajawal",Arial,sans-serif'; ctx.fillStyle=color;
        ctx.shadowColor=color; ctx.shadowBlur=20; ctx.fillText(name,256,64);
        const t=new THREE.CanvasTexture(c); t.anisotropy=16; return t;
    }

    // === Scene Init ===
    let roughTex, bumpTex, wdTex, islamicTex;
    function initScene(){
        setLoad(5);
        scene=new THREE.Scene(); scene.background=new THREE.Color(PAL.BG);
        scene.fog=new THREE.FogExp2(PAL.BG, 0.015);
        camera=new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 500);
        camera.position.set(0, 4.5, 10); camera.lookAt(0,2.5,-3);
        renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
        renderer.setSize(innerWidth, innerHeight);
        renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
        renderer.outputEncoding=THREE.sRGBEncoding;
        document.getElementById('gameCanvas').appendChild(renderer.domElement);
        clock=new THREE.Clock();
        roughTex=noiseMap(512,50,200,false); bumpTex=noiseMap(512,100,150,true);
        wdTex=woodMap(512); islamicTex=islamicPatternMap(512);
        setLoad(15);
    }

    // === Cinematic Lighting ===
    function initLighting(){
        scene.add(new THREE.AmbientLight(0x8899aa, 0.25));
        // Main overhead
        const oh=new THREE.PointLight(0xfff5e6,0.8,60); oh.position.set(0,14,-3);
        oh.castShadow=true; oh.shadow.mapSize.set(2048,2048); oh.shadow.bias=-0.0005; scene.add(oh);
        // Stage key lights
        [[-5,8,-4, 0xeeffee],[5,8,-4, 0xffeedd]].forEach(([x,y,z,c])=>{
            const s=new THREE.SpotLight(c,2.5,25,Math.PI/5,0.6,1);
            s.position.set(x,y,z); s.target.position.set(x*0.5,0,z); s.castShadow=true;
            s.shadow.mapSize.set(1024,1024); scene.add(s); scene.add(s.target);
        });
        // Colored accent lights
        const gL=new THREE.PointLight(PAL.GREEN_NEON,2.0,18); gL.position.set(-6,3.5,-7); scene.add(gL);
        const oL=new THREE.PointLight(PAL.ORANGE_NEON,2.0,18); oL.position.set(6,3.5,-7); scene.add(oL);
        // Floor uplights
        const gU=new THREE.PointLight(PAL.GREEN_NEON,0.6,8); gU.position.set(-3,0.1,-2); scene.add(gU);
        const oU=new THREE.PointLight(PAL.ORANGE_NEON,0.6,8); oU.position.set(3,0.1,-2); scene.add(oU);
        // Back wall wash
        const bw=new THREE.SpotLight(0xffd700,1.5,20,Math.PI/3,0.8,1);
        bw.position.set(0,8,-5); bw.target.position.set(0,3,-8); scene.add(bw); scene.add(bw.target);
        setLoad(25);
    }

    // === Materials ===
    function mat(color,rough,metal,extra){
        const o={color,roughness:rough,metalness:metal,...extra};
        if(extra?.emissive) o.emissiveIntensity=extra.emissiveIntensity||1;
        return new THREE.MeshStandardMaterial(o);
    }
    const M={};
    function initMaterials(){
        M.concrete=mat(PAL.DARK,0.85,0.15,{roughnessMap:roughTex,bumpMap:bumpTex,bumpScale:0.15});
        M.wood=mat(PAL.WOOD_MID,0.55,0.1,{map:wdTex,bumpMap:wdTex,bumpScale:0.4});
        M.woodGold=mat(PAL.WOOD_LIGHT,0.4,0.2,{map:wdTex,bumpMap:wdTex,bumpScale:0.3});
        M.goldTrim=mat(PAL.GOLD,0.3,0.7,{emissive:PAL.GOLD,emissiveIntensity:0.3});
        M.glass=mat(PAL.BLACK,0.05,0.9);
        M.stage=mat(0x181818,0.15,0.6,{roughnessMap:roughTex});
        M.chairMetal=mat(0x1a1a1a,0.25,0.85);
        M.chairFabric=mat(0x0c0c0c,0.92,0.0,{bumpMap:roughTex,bumpScale:0.3});
        M.hexFrame=mat(0x080808,0.4,0.3);
        M.islamic=mat(PAL.WOOD_DARK,0.5,0.2,{map:islamicTex,bumpMap:islamicTex,bumpScale:0.2});
        M.trussMetal=mat(0x0e0e0e,0.2,0.85);
        setLoad(30);
    }

    // === Chair ===
    function mkChair(){
        const g=new THREE.Group();
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.28,12),M.chairMetal);
        pole.position.y=0.14; g.add(pole);
        for(let i=0;i<5;i++){
            const l=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.03,0.32),M.chairMetal);
            l.position.y=0.04; l.rotation.y=(Math.PI*2/5)*i; l.translateX(0.16); g.add(l);
            const w=new THREE.Mesh(new THREE.SphereGeometry(0.025,8,8),M.chairMetal);
            w.position.set(0,0.02,0); l.add(w); w.position.set(0,-0.01,0.155);
        }
        const seat=new THREE.Mesh(new THREE.BoxGeometry(0.48,0.055,0.44),M.chairFabric);
        seat.position.y=0.31; seat.castShadow=true; g.add(seat);
        // Armrests
        for(let s of[-1,1]){
            const arm=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.18,0.04),M.chairMetal);
            arm.position.set(s*0.24,0.4,-0.05); g.add(arm);
            const pad=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.02,0.2),M.chairFabric);
            pad.position.set(s*0.24,0.5,-0.05); g.add(pad);
        }
        const sp=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.4,0.04),M.chairMetal);
        sp.position.set(0,0.48,-0.2); g.add(sp);
        const bk=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.5,0.025),M.chairFabric);
        bk.position.set(0,0.62,-0.22); bk.rotation.x=-0.08; bk.castShadow=true; g.add(bk);
        // Headrest
        const hr=new THREE.Mesh(new THREE.BoxGeometry(0.25,0.12,0.03),M.chairFabric);
        hr.position.set(0,0.92,-0.24); hr.rotation.x=-0.05; g.add(hr);
        return g;
    }

    // === Dense Honeycomb Wall ===
    function mkHoneycomb(parent, neonColor, rows, cols, hR, isRight){
        const hY=hR*Math.sqrt(3);
        const outerGeo=new THREE.ExtrudeGeometry(hexShape(hR,true),{depth:0.12,bevelEnabled:true,bevelThickness:0.015,bevelSize:0.01});
        const innerGeo=new THREE.ExtrudeGeometry(hexShape(hR*0.86,true),{depth:0.13,bevelEnabled:false});
        const glowMat=mat(0xffffff,0.3,0.1,{emissive:neonColor,emissiveIntensity:2.5});
        const dimMat=mat(0xffffff,0.3,0.1,{emissive:neonColor,emissiveIntensity:0.8});

        for(let r=0;r<rows;r++){
            const cn=r%2===0?cols:cols-1;
            const oX=r%2===0?0:hR*1.5;
            for(let c=0;c<cn;c++){
                if(Math.random()<0.03) continue;
                const x=(isRight?1:-1)*(0.8+oX+c*hR*3);
                const y=1.2+r*hY*0.92;
                const hg=new THREE.Group(); hg.position.set(x,y,0.06);
                const frame=new THREE.Mesh(outerGeo,M.hexFrame); frame.castShadow=true;
                const bright=Math.random()>0.3;
                const face=new THREE.Mesh(innerGeo,bright?glowMat:dimMat);
                hg.add(frame); hg.add(face);
                parent.add(hg);
            }
        }
    }

    // === Giant Hexagonal Wing Shape ===
    function mkWingPanel(studioG, side){
        const isRight=side>0;
        const wingG=new THREE.Group();
        // Position at corner of back wall, angled 45°
        wingG.position.set(side*2.2, 0, -8.2);
        wingG.rotation.y=isRight?-Math.PI/4:Math.PI/4;

        // Main wall surface
        const wLen=6.5, wH=6.5;
        const wall=new THREE.Mesh(new THREE.PlaneGeometry(wLen,wH),M.concrete);
        wall.position.set((isRight?1:-1)*wLen/2, wH/2, 0); wall.receiveShadow=true; wingG.add(wall);

        // Gold trim border around wing
        const trimGeo=new THREE.BoxGeometry(0.08,wH,0.15);
        const trim1=new THREE.Mesh(trimGeo,M.goldTrim);
        trim1.position.set((isRight?1:-1)*0.1, wH/2, 0.05); wingG.add(trim1);
        const trim2=new THREE.Mesh(trimGeo,M.goldTrim);
        trim2.position.set((isRight?1:-1)*wLen, wH/2, 0.05); wingG.add(trim2);
        // Top trim
        const trimTop=new THREE.Mesh(new THREE.BoxGeometry(wLen,0.08,0.15),M.goldTrim);
        trimTop.position.set((isRight?1:-1)*wLen/2, wH, 0.05); wingG.add(trimTop);

        // Islamic geometric border panels
        const islamicPanel=new THREE.Mesh(new THREE.PlaneGeometry(0.8,wH-1),M.islamic);
        islamicPanel.position.set((isRight?1:-1)*0.5, wH/2, 0.02); wingG.add(islamicPanel);

        // Dense honeycomb
        mkHoneycomb(wingG, isRight?PAL.ORANGE_NEON:PAL.GREEN_NEON, 6, 5, 0.5, isRight);

        studioG.add(wingG);
    }

    // === Team Desk ===
    function mkTeamDesk(neonColor, teamName, colorStr){
        const dG=new THREE.Group();
        const W=3.0, H=0.85, D=0.95;
        // Main body with angled front
        const body=new THREE.Mesh(new THREE.BoxGeometry(W,H,D),M.wood);
        body.position.set(0,H/2,0); body.castShadow=true; dG.add(body);
        // Glass top
        const glass=new THREE.Mesh(new THREE.BoxGeometry(W+0.04,0.015,D+0.04),M.glass);
        glass.position.set(0,H+0.01,0); dG.add(glass);
        // Neon strips - top and bottom
        const nMat=mat(0xffffff,0.1,0.0,{emissive:neonColor,emissiveIntensity:4.0});
        const sTop=new THREE.Mesh(new THREE.BoxGeometry(W+0.06,0.035,0.035),nMat);
        sTop.position.set(0,H-0.02,D/2+0.01); dG.add(sTop);
        const sBot=new THREE.Mesh(new THREE.BoxGeometry(W+0.06,0.035,0.035),nMat);
        sBot.position.set(0,0.06,D/2+0.01); dG.add(sBot);
        // Side neon accents
        for(let s of [-1,1]){
            const sv=new THREE.Mesh(new THREE.BoxGeometry(0.035,H-0.1,0.035),nMat);
            sv.position.set(s*W/2,H/2,D/2+0.01); dG.add(sv);
        }
        // Team name LED display
        const namePlane=new THREE.Mesh(new THREE.PlaneGeometry(W*0.7,0.25),
            new THREE.MeshBasicMaterial({map:teamNameTex(teamName,colorStr),transparent:true}));
        namePlane.position.set(0,H/2,D/2+0.02); dG.add(namePlane);
        // Gold accents on edges
        const gEdge=new THREE.Mesh(new THREE.BoxGeometry(W+0.08,0.04,0.04),M.goldTrim);
        gEdge.position.set(0,H,D/2-0.02); dG.add(gEdge);
        // 3 Chairs
        for(let i of[-1.0,0,1.0]){const ch=mkChair(); ch.position.set(i,0,-0.65); dG.add(ch);}
        // 3 Buzzers
        for(let i of[-1.0,0,1.0]){
            const bb=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,0.04,24),mat(0x111111,0.2,0.75));
            bb.position.set(i,H+0.03,0.15); dG.add(bb);
            const btn=new THREE.Mesh(new THREE.SphereGeometry(0.075,24,12,0,Math.PI*2,0,Math.PI/2),
                mat(0xcc0000,0.3,0.4,{emissive:0x440000,emissiveIntensity:0.5}));
            btn.position.set(i,H+0.05,0.15); dG.add(btn); buzzerMeshes.push(btn);
        }
        return dG;
    }

    // === Presenter Curved Desk ===
    function mkPresenterDesk(){
        const dG=new THREE.Group();
        const desk=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.0,0.85,48,1,false,-Math.PI/5,Math.PI*2/5),M.wood);
        desk.position.set(0,0.42,0); desk.castShadow=true; dG.add(desk);
        // Glass top
        const gtop=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.25,0.02,48,1,false,-Math.PI/5,Math.PI*2/5),M.glass);
        gtop.position.set(0,0.86,0); dG.add(gtop);
        // Gold trim on front edge
        const gTrim=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.03,8,48,Math.PI*2/5),M.goldTrim);
        gTrim.rotation.x=Math.PI/2; gTrim.rotation.z=Math.PI/2+Math.PI/10;
        gTrim.position.set(0,0.85,0); dG.add(gTrim);
        // Monitor screens on desk
        for(let i of[-0.6,0.6]){
            const screen=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.35,0.02),mat(0x111133,0.1,0.8,{emissive:0x1a1a3a,emissiveIntensity:0.5}));
            screen.position.set(i,1.1,-0.3); screen.rotation.x=-0.15; dG.add(screen);
            const sBase=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,0.03,16),M.chairMetal);
            sBase.position.set(i,0.87,-0.3); dG.add(sBase);
            const sPole=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.2,8),M.chairMetal);
            sPole.position.set(i,0.98,-0.3); dG.add(sPole);
        }
        return dG;
    }

    // === Neon Floor Lines ===
    function mkFloorLines(studioG){
        const nG=mat(0xffffff,0.1,0,{emissive:PAL.GREEN_NEON,emissiveIntensity:3.0});
        const nO=mat(0xffffff,0.1,0,{emissive:PAL.ORANGE_NEON,emissiveIntensity:3.0});
        // Center divider
        const div=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.015,14),mat(0xffffff,0.1,0,{emissive:0xffffff,emissiveIntensity:2}));
        div.position.set(0,0.008,-1); studioG.add(div);
        // Geometric floor patterns - Green side
        const lines=[
            [-1.5,0.008,1, 0.04,0.015,6, 0],[-3,0.008,-1, 0.04,0.015,4, 0],
            [-1.5,0.008,2, 3,0.015,0.04, 0],[-1.5,0.008,-2, 4,0.015,0.04, 0],
            [-4,0.008,0, 0.04,0.015,5, 0],
            [-2.5,0.008,0, 3,0.015,0.04, Math.PI/6],
        ];
        lines.forEach(([x,y,z,w,h,d,ry])=>{
            const l=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),nG);
            l.position.set(x,y,z); l.rotation.y=ry; studioG.add(l);
        });
        // Orange side (mirrored)
        lines.forEach(([x,y,z,w,h,d,ry])=>{
            const l=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),nO);
            l.position.set(-x,y,z); l.rotation.y=-ry; studioG.add(l);
        });
        // Hexagonal floor accent near stage
        for(let i=0;i<6;i++){
            const a=(Math.PI/3)*i; const r=1.5;
            const x=Math.cos(a)*r, z=-5+Math.sin(a)*r;
            const next=(i+1)%6;
            const x2=Math.cos((Math.PI/3)*next)*r, z2=-5+Math.sin((Math.PI/3)*next)*r;
            const len=Math.sqrt((x2-x)**2+(z2-z)**2);
            const ang=Math.atan2(x2-x,z2-z);
            const seg=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.015,len),M.goldTrim);
            seg.position.set((x+x2)/2,0.01,(z+z2)/2); seg.rotation.y=ang; studioG.add(seg);
        }
    }

    // === Hexagonal Ceiling Light Panels ===
    function mkCeiling(studioG){
        const cG=new THREE.Group(); cG.position.y=7;
        // Dark ceiling plane
        const ceil=new THREE.Mesh(new THREE.PlaneGeometry(16,16),mat(0x060608,0.95,0.1));
        ceil.rotation.x=Math.PI/2; ceil.position.y=0.5; cG.add(ceil);
        const hR=0.7, hY=hR*Math.sqrt(3);
        const panelGeo=new THREE.ExtrudeGeometry(hexShape(hR*0.85,true),{depth:0.15,bevelEnabled:false});
        const frameGeo=new THREE.ExtrudeGeometry(hexShape(hR,true),{depth:0.08,bevelEnabled:false});
        const glowMat=mat(0xffffff,0.1,0.1,{emissive:0xeeeeff,emissiveIntensity:1.5});
        const dimMat=mat(0xffffff,0.1,0.1,{emissive:0x888899,emissiveIntensity:0.4});

        for(let r=0;r<6;r++){
            const cn=r%2===0?7:6;
            const oX=r%2===0?0:hR*1.5;
            for(let c=0;c<cn;c++){
                const x=-4.5+oX+c*hR*3;
                const z=-7+r*hY*0.95;
                if(Math.abs(x)>5.5) continue;
                const bright=Math.random()>0.4;
                const frame=new THREE.Mesh(frameGeo,M.trussMetal);
                frame.position.set(x,0,z); frame.rotation.x=-Math.PI/2; cG.add(frame);
                if(bright){
                    const panel=new THREE.Mesh(panelGeo,Math.random()>0.3?glowMat:dimMat);
                    panel.position.set(x,-0.1,z); panel.rotation.x=-Math.PI/2; cG.add(panel);
                }
            }
        }
        // Truss bars
        for(let x=-6;x<=6;x+=3){
            const bar=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.3,16),M.trussMetal);
            bar.position.set(x,0.3,-1); cG.add(bar);
        }
        for(let z=-8;z<=4;z+=3){
            const bar=new THREE.Mesh(new THREE.BoxGeometry(14,0.3,0.06),M.trussMetal);
            bar.position.set(0,0.3,z); cG.add(bar);
        }
        // Stage light fixtures
        [[-4,0,-3],[4,0,-3],[-2,0,-6],[2,0,-6],[0,0,-4],[-5,0,0],[5,0,0]].forEach(([x,y,z])=>{
            const fix=new THREE.Group();
            const body=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.4,12),M.trussMetal);
            fix.add(body);
            const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.05,12),
                mat(0xffffff,0.1,0.1,{emissive:0xffffff,emissiveIntensity:0.8}));
            lens.position.y=-0.22; fix.add(lens);
            fix.position.set(x,y-0.2,z); cG.add(fix);
        });
        studioG.add(cG);
    }

    // === Audience Seating (Curved Amphitheater) ===
    function mkAudience(studioG,cx,cz,rows,cols,rot){
        for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
            const ch=mkChair();
            const spread=0.85+r*0.05;
            ch.position.set(cx+(c-cols/2)*spread, 0, cz+r*1.05);
            ch.rotation.y=rot-r*rot*0.05;
            ch.castShadow=true; studioG.add(ch);
        }
    }

    // ══════════════════════════════════════════════
    //  MASTER STUDIO BUILD
    // ══════════════════════════════════════════════
    function buildStudio(){
        setLoad(35);
        const S=new THREE.Group();

        // --- Floor ---
        const floorL=new THREE.Mesh(new THREE.PlaneGeometry(7,16),mat(PAL.GREEN_DARK,0.75,0.2,{roughnessMap:roughTex,bumpMap:bumpTex,bumpScale:0.08}));
        floorL.rotation.x=-Math.PI/2; floorL.position.set(-3.5,0,-1); floorL.receiveShadow=true; S.add(floorL);
        const floorR=new THREE.Mesh(new THREE.PlaneGeometry(7,16),mat(PAL.ORANGE_DARK,0.75,0.2,{roughnessMap:roughTex,bumpMap:bumpTex,bumpScale:0.08}));
        floorR.rotation.x=-Math.PI/2; floorR.position.set(3.5,0,-1); floorR.receiveShadow=true; S.add(floorR);
        mkFloorLines(S);
        setLoad(45);

        // --- Stage Platform ---
        const plat=new THREE.Mesh(new THREE.BoxGeometry(5,0.25,3),M.stage);
        plat.position.set(0,0.125,-6.5); plat.receiveShadow=true; plat.castShadow=true; S.add(plat);
        // Steps
        const step1=new THREE.Mesh(new THREE.BoxGeometry(5,0.12,0.5),M.stage);
        step1.position.set(0,0.06,-4.75); step1.receiveShadow=true; S.add(step1);
        // Platform neon edge
        const pNeon=mat(0xffffff,0.1,0,{emissive:PAL.GOLD_BRIGHT,emissiveIntensity:2.0});
        const pEdge=new THREE.Mesh(new THREE.BoxGeometry(5.02,0.03,0.03),pNeon);
        pEdge.position.set(0,0.25,-5); S.add(pEdge);
        setLoad(50);

        // --- Center Back Wall ---
        const cWall=new THREE.Mesh(new THREE.PlaneGeometry(4.5,7),M.concrete);
        cWall.position.set(0,3.5,-8.3); cWall.receiveShadow=true; S.add(cWall);

        // --- Hexagonal Logo Frame ---
        const outerH=hexShape(2.0,true), innerH=hexShape(1.65,true);
        outerH.holes.push(innerH);
        const frameGeo=new THREE.ExtrudeGeometry(outerH,{depth:0.35,bevelEnabled:true,bevelThickness:0.06,bevelSize:0.03});
        const logoFrame=new THREE.Mesh(frameGeo,M.woodGold);
        logoFrame.position.set(0,3.5,-8.1); logoFrame.castShadow=true; S.add(logoFrame);
        // Gold inner trim
        const innerTrimH=hexShape(1.7,true), innerTrimH2=hexShape(1.62,true);
        innerTrimH.holes.push(innerTrimH2);
        const trimGeo=new THREE.ExtrudeGeometry(innerTrimH,{depth:0.38,bevelEnabled:false});
        const innerTrim=new THREE.Mesh(trimGeo,M.goldTrim);
        innerTrim.position.set(0,3.5,-8.12); S.add(innerTrim);
        // Glowing background
        const bgGlow=new THREE.Mesh(new THREE.PlaneGeometry(3.2,3.2),mat(0x1a1008,0.3,0.1,{emissive:0x332200,emissiveIntensity:0.6}));
        bgGlow.position.set(0,3.5,-8.0); S.add(bgGlow);
        // Logo texture
        const logoP=new THREE.Mesh(new THREE.PlaneGeometry(2.8,2.8),new THREE.MeshBasicMaterial({map:logoTex(),transparent:true,depthWrite:false}));
        logoP.position.set(0,3.5,-7.95); S.add(logoP);
        setLoad(60);

        // --- Wing Walls ---
        mkWingPanel(S, -1); // Left green
        mkWingPanel(S,  1); // Right orange
        setLoad(70);

        // --- Team Desks ---
        const lDesk=mkTeamDesk(PAL.GREEN_NEON,'الفريق الأخضر','#22c55e');
        lDesk.position.set(-3.8,0,-3.5); lDesk.rotation.y=Math.PI/6; S.add(lDesk);
        const rDesk=mkTeamDesk(PAL.ORANGE_NEON,'فريق البرتقالي','#f97316');
        rDesk.position.set(3.8,0,-3.5); rDesk.rotation.y=-Math.PI/6; S.add(rDesk);

        // --- Presenter Desk ---
        const pDesk=mkPresenterDesk();
        pDesk.position.set(0,0.25,-5.8); S.add(pDesk);
        // Presenter chairs
        for(let i of[-0.85,0,0.85]){const ch=mkChair(); ch.position.set(i,0.25,-6.8); S.add(ch);}
        setLoad(80);

        // --- Audience Seating ---
        mkAudience(S, -3.5, 0, 5, 4, Math.PI/7);
        mkAudience(S,  3.5, 0, 5, 4, -Math.PI/7);
        // Center aisle chairs
        mkAudience(S, 0, 1.5, 3, 3, 0);
        setLoad(85);

        // --- Ceiling ---
        mkCeiling(S);
        setLoad(90);

        // --- Side walls (dark, far) ---
        for(let s of[-1,1]){
            const sw=new THREE.Mesh(new THREE.PlaneGeometry(16,8),M.concrete);
            sw.position.set(s*8,4,-1); sw.rotation.y=-s*Math.PI/2; sw.receiveShadow=true; S.add(sw);
        }
        // Back fill
        const bWall=new THREE.Mesh(new THREE.PlaneGeometry(18,8),M.concrete);
        bWall.position.set(0,4,-9); bWall.receiveShadow=true; S.add(bWall);

        scene.add(S);
    }

    // === Letter Map (Opposite Wall) ===
    function buildLetterMap(){
        const g=new THREE.Group(); g.position.set(0,5,15); g.rotation.y=Math.PI;
        const hr=0.6, hh=hr*Math.sqrt(3); let li=0;
        for(let r=0;r<5;r++){
            const ci=r%2===0?6:5, ox=r%2===0?0:hr*1.5;
            for(let c=0;c<ci;c++){
                if(li>=28)break;
                const letter=ARABIC[li];
                const x=-4.5+ox+c*hr*3, y=3.6-r*hh*0.9;
                const geo=new THREE.ExtrudeGeometry(hexShape(hr*0.9,true),{depth:0.1,bevelEnabled:true,bevelThickness:0.02,bevelSize:0.02});
                const mt=mat(0x444444,0.5,0.3,{emissive:0x333333,emissiveIntensity:0.2});
                const mesh=new THREE.Mesh(geo,mt);
                mesh.position.set(x,y,0); mesh.userData={letter,state:'unclaimed'};
                g.add(mesh); hexMeshes[letter]=mesh; li++;
            }
        }
        scene.add(g);
    }

    function updateHexColors(hm){
        Object.entries(hm).forEach(([letter,state])=>{
            const m=hexMeshes[letter]; if(!m)return;
            m.userData.state=state;
            if(state==='team1'){m.material.color.setHex(PAL.GREEN_NEON);m.material.emissive.setHex(PAL.GREEN_NEON);m.material.emissiveIntensity=0.8;}
            else if(state==='team2'){m.material.color.setHex(PAL.ORANGE_NEON);m.material.emissive.setHex(PAL.ORANGE_NEON);m.material.emissiveIntensity=0.8;}
            else{m.material.color.setHex(0x333344);m.material.emissive.setHex(0x111122);m.material.emissiveIntensity=0.1;}
        });
    }

    // === FPS Controls ===
    function initFPS(){
        controls=new THREE.PointerLockControls(camera,document.body);
        const blocker=document.getElementById('blocker'), instr=document.getElementById('instructions'), cross=document.getElementById('crosshair');
        if(instr)instr.addEventListener('click',()=>controls.lock());
        controls.addEventListener('lock',()=>{if(instr)instr.style.display='none';if(blocker)blocker.style.display='none';if(cross)cross.style.display='flex';});
        controls.addEventListener('unlock',()=>{if(blocker)blocker.style.display='flex';if(instr)instr.style.display='block';if(cross)cross.style.display='none';});
        scene.add(controls.getObject());
        const kd=e=>{switch(e.code){case'ArrowUp':case'KeyW':moveF=true;break;case'ArrowLeft':case'KeyA':moveL=true;break;case'ArrowDown':case'KeyS':moveB=true;break;case'ArrowRight':case'KeyD':moveR=true;break;}};
        const ku=e=>{switch(e.code){case'ArrowUp':case'KeyW':moveF=false;break;case'ArrowLeft':case'KeyA':moveL=false;break;case'ArrowDown':case'KeyS':moveB=false;break;case'ArrowRight':case'KeyD':moveR=false;break;}};
        document.addEventListener('keydown',kd); document.addEventListener('keyup',ku);
        document.addEventListener('mousedown',()=>{
            if(controls.isLocked){
                raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
                const hits=raycaster.intersectObjects(buzzerMeshes);
                if(hits.length>0){const b=hits[0].object; b.position.y-=0.02; setTimeout(()=>{b.position.y+=0.02;},100); if(socket)socket.emit('buzz');}
            }
        });
    }

    // === Socket ===
    function initSocket(){
        socket=io(); socket.emit('display_join',{roomId});
        socket.on('hex_update',d=>{if(d.hexMap)updateHexColors(d.hexMap);});
        socket.on('map_update',tiles=>{if(!tiles)return;const hm={};tiles.forEach(t=>{hm[t.letter]=t.state;});updateHexColors(hm);});
    }

    // === Animate ===
    function animate(){
        requestAnimationFrame(animate);
        const dt=clock.getDelta();
        if(controls&&controls.isLocked){
            velocity.x-=velocity.x*12*dt; velocity.z-=velocity.z*12*dt;
            direction.z=Number(moveF)-Number(moveB); direction.x=Number(moveR)-Number(moveL); direction.normalize();
            if(moveF||moveB)velocity.z-=direction.z*25*dt;
            if(moveL||moveR)velocity.x-=direction.x*25*dt;
            controls.moveRight(-velocity.x*dt); controls.moveForward(-velocity.z*dt);
            camera.position.y=1.8;
        }
        renderer.render(scene,camera);
    }

    function boot(){
        initScene(); initMaterials(); initLighting();
        buildStudio(); buildLetterMap();
        initFPS(); initSocket();
        window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
        setLoad(100);
        setTimeout(()=>{const l=document.getElementById('loadingScreen');if(l)l.classList.add('hide');const b=document.getElementById('blocker');if(b)b.style.display='flex';},500);
        animate();
    }
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
