"use strict";

const {
  requireName,
} = require("./shared.js");

function applyLinuxAvatarOverlayMousePassthroughPatch(currentSource) {
  let patchedSource = currentSource;
  const childProcessVar = requireName(currentSource, "node:child_process");
  const i3SessionMethod =
    "codexLinuxIsI3Session(){let e=[process.env.XDG_CURRENT_DESKTOP,process.env.DESKTOP_SESSION,process.env.I3SOCK].filter(Boolean).join(`:`).toLowerCase();return/(^|[:;/])i3([:;/.-]|$)/.test(e)}";
  const compositorHintsMethod =
    childProcessVar == null
      ? "codexLinuxApplyAvatarCompositorHints(e){}"
      : `codexLinuxApplyAvatarCompositorHints(e){if(process.platform!==\`linux\`||!this.codexLinuxIsI3Session()||this.codexLinuxAvatarCompositorHintsApplied||this.codexLinuxAvatarCompositorHintsApplying||e==null||e.isDestroyed()||!process.env.DISPLAY)return;let t;try{t=e.getBounds?.()??e.getContentBounds?.()}catch{}if(t==null||!Number.isFinite(t.x)||!Number.isFinite(t.y)||!Number.isFinite(t.width)||!Number.isFinite(t.height))return;let n=[];try{let r=e.getNativeWindowHandle?.();r!=null&&r.length>=4&&n.push(String(r.readUInt32LE(0)))}catch{}this.codexLinuxAvatarCompositorHintsApplying=!0;let r=e=>{let r=[...new Set(e)].filter(e=>/^[0-9]+$/.test(e)&&e!==\`0\`);if(r.length===0){this.codexLinuxAvatarCompositorHintsApplying=!1;return}let i=r.length,a=!1,o=()=>{i--,i===0&&(this.codexLinuxAvatarCompositorHintsApplying=!1,a&&(this.codexLinuxAvatarCompositorHintsApplied=!0))},s=e=>{try{${childProcessVar}.execFile(\`xwininfo\`,[\`-id\`,e],{timeout:1e3},(r,i)=>{if(r){o();return}let s=String(i??\`\`),c=s.match(/Absolute upper-left X:\\s+(-?\\d+)[\\s\\S]*Absolute upper-left Y:\\s+(-?\\d+)[\\s\\S]*Width:\\s+(\\d+)[\\s\\S]*Height:\\s+(\\d+)/);if(c==null||!/Override Redirect State:\\s+yes/.test(s)){o();return}let[,l,h,d,f]=c;if(Number(l)!==t.x||Number(h)!==t.y||Number(d)!==t.width||Number(f)!==t.height){o();return}try{${childProcessVar}.execFile(\`xprop\`,[\`-id\`,e,\`-f\`,\`_GTK_FRAME_EXTENTS\`,\`32c\`,\`-set\`,\`_GTK_FRAME_EXTENTS\`,\`0, 0, 0, 0\`],{timeout:1e3},e=>{e||(a=!0),o()})}catch{o()}})}catch{o()}};for(let t of r)s(t)};try{${childProcessVar}.execFile(\`xdotool\`,[\`search\`,\`--pid\`,String(process.pid)],{timeout:1e3},(e,t)=>{r([...n,...String(t??\`\`).trim().split(/\\s+/).filter(Boolean)])})}catch{r(n)}}`;
  const previousCompositorHintsMethod =
    childProcessVar == null
      ? null
      : `codexLinuxApplyAvatarCompositorHints(e){if(process.platform!==\`linux\`||!this.codexLinuxIsI3Session()||this.codexLinuxAvatarCompositorHintsApplied||e==null||e.isDestroyed()||!process.env.DISPLAY)return;let t=null;try{let n=e.getNativeWindowHandle?.();n!=null&&n.length>=4&&(t=n.readUInt32LE(0))}catch{}if(!Number.isFinite(t)||t<=0)return;this.codexLinuxAvatarCompositorHintsApplied=!0;try{${childProcessVar}.execFile(\`xprop\`,[\`-id\`,String(t),\`-f\`,\`_GTK_FRAME_EXTENTS\`,\`32c\`,\`-set\`,\`_GTK_FRAME_EXTENTS\`,\`0, 0, 0, 0\`],{timeout:1e3},e=>{e&&(this.codexLinuxAvatarCompositorHintsApplied=!1)})}catch{this.codexLinuxAvatarCompositorHintsApplied=!1}}`;
  const previousUnscopedCompositorHintsMethod =
    childProcessVar == null
      ? null
      : `codexLinuxApplyAvatarCompositorHints(e){if(process.platform!==\`linux\`||!this.codexLinuxIsI3Session()||this.codexLinuxAvatarCompositorHintsApplied||e==null||e.isDestroyed()||!process.env.DISPLAY)return;let t=[];try{let n=e.getNativeWindowHandle?.();n!=null&&n.length>=4&&t.push(String(n.readUInt32LE(0)))}catch{}this.codexLinuxAvatarCompositorHintsApplying=!0;let n=e=>{let t=[...new Set(e)].filter(e=>/^[0-9]+$/.test(e)&&e!==\`0\`);if(t.length===0){this.codexLinuxAvatarCompositorHintsApplying=!1;return}let n=t.length,r=!1,i=()=>{n--,n===0&&(this.codexLinuxAvatarCompositorHintsApplying=!1,r&&(this.codexLinuxAvatarCompositorHintsApplied=!0))};for(let a of t)try{${childProcessVar}.execFile(\`xprop\`,[\`-id\`,a,\`-f\`,\`_GTK_FRAME_EXTENTS\`,\`32c\`,\`-set\`,\`_GTK_FRAME_EXTENTS\`,\`0, 0, 0, 0\`],{timeout:1e3},e=>{e||(r=!0),i()})}catch{i()}};try{${childProcessVar}.execFile(\`xdotool\`,[\`search\`,\`--pid\`,String(process.pid)],{timeout:1e3},(e,r)=>{n([...t,...String(r??\`\`).trim().split(/\\s+/).filter(Boolean)])})}catch{n(t)}}`;

  const interactivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1;return}let t=!this.pointerInteractive;if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0});return}e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}}refreshCursorAtCurrentMousePosition(e){";
  const previousInteractivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1,this.codexLinuxStopAvatarPassthroughRecovery();return}let t=!this.pointerInteractive;if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0}),this.codexLinuxStartAvatarPassthroughRecovery();return}this.codexLinuxStopAvatarPassthroughRecovery(),e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}else t&&this.codexLinuxStartAvatarPassthroughRecovery()}codexLinuxStopAvatarPassthroughRecovery(){this.codexLinuxAvatarPassthroughRecoveryTimer!=null&&(clearInterval(this.codexLinuxAvatarPassthroughRecoveryTimer),this.codexLinuxAvatarPassthroughRecoveryTimer=null)}codexLinuxRecoverAvatarPointerInteractivity(){this.pointerInteractive=!0,this.applyPointerInteractivityPolicy()}codexLinuxStartAvatarPassthroughRecovery(){if(process.platform!==`linux`||this.codexLinuxAvatarPassthroughRecoveryTimer!=null)return;this.codexLinuxAvatarPassthroughRecoveryTimer=setInterval(()=>{let e=this.window;if(e==null||e.isDestroyed()||!this.mousePassthroughEnabled){this.codexLinuxStopAvatarPassthroughRecovery();return}let t;try{t=this.codexLinuxIsCursorInAvatarInteractiveRegion(e)}catch{this.codexLinuxRecoverAvatarPointerInteractivity();return}t&&this.codexLinuxRecoverAvatarPointerInteractivity()},80),this.codexLinuxAvatarPassthroughRecoveryTimer.unref?.()}codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y,s=e=>e!=null&&a>=e.left&&a<=e.left+e.width&&o>=e.top&&o<=e.top+e.height;return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const previousSyncInteractivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1,this.codexLinuxStopAvatarPassthroughRecovery();return}process.platform===`linux`&&(this.codexLinuxStartAvatarPassthroughRecovery(),this.codexLinuxSyncAvatarPointerInteractivity(e));let t=!this.pointerInteractive;this.dragState!=null&&(t=!1);if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0});return}e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}}codexLinuxStopAvatarPassthroughRecovery(){this.codexLinuxAvatarPassthroughRecoveryTimer!=null&&(clearInterval(this.codexLinuxAvatarPassthroughRecoveryTimer),this.codexLinuxAvatarPassthroughRecoveryTimer=null)}codexLinuxStartAvatarPassthroughRecovery(){if(process.platform!==`linux`||this.codexLinuxAvatarPassthroughRecoveryTimer!=null)return;this.codexLinuxAvatarPassthroughRecoveryTimer=setInterval(()=>{let e=this.window;if(e==null||e.isDestroyed()||!e.isVisible()){this.codexLinuxStopAvatarPassthroughRecovery();return}this.codexLinuxSyncAvatarPointerInteractivity(e)&&this.applyPointerInteractivityPolicy()},32),this.codexLinuxAvatarPassthroughRecoveryTimer.unref?.()}codexLinuxSyncAvatarPointerInteractivity(e){if(process.platform!==`linux`||e==null||e.isDestroyed())return!1;if(this.dragState!=null){if(this.pointerInteractive)return!1;return this.pointerInteractive=!0,!0}let t;try{t=this.codexLinuxIsCursorInAvatarInteractiveRegion(e)}catch{t=!0}return this.pointerInteractive===t?!1:(this.pointerInteractive=t,!0)}codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y;if(a<0||o<0||a>i.width||o>i.height)return!1;let s=e=>e!=null&&a>=e.left&&a<=e.left+e.width&&o>=e.top&&o<=e.top+e.height;return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const previousShapeInteractivityNeedle =
    "applyPointerInteractivityPolicy(){let e=this.window;if(e==null||e.isDestroyed()){this.mousePassthroughEnabled=!1,this.codexLinuxStopAvatarPassthroughRecovery();return}if(process.platform===`linux`&&typeof e.setShape==`function`){this.codexLinuxStopAvatarPassthroughRecovery(),this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1,e.setIgnoreMouseEvents(!1));if(this.codexLinuxApplyAvatarInputShape(e))return}process.platform===`linux`&&(this.codexLinuxStartAvatarPassthroughRecovery(),this.codexLinuxSyncAvatarPointerInteractivity(e));let t=!this.pointerInteractive;this.dragState!=null&&(t=!1);if(this.mousePassthroughEnabled!==t){if(this.mousePassthroughEnabled=t,t){e.setIgnoreMouseEvents(!0,{forward:!0});return}e.setIgnoreMouseEvents(!1),this.refreshCursorAtCurrentMousePosition(e)}}codexLinuxStopAvatarPassthroughRecovery(){this.codexLinuxAvatarPassthroughRecoveryTimer!=null&&(clearInterval(this.codexLinuxAvatarPassthroughRecoveryTimer),this.codexLinuxAvatarPassthroughRecoveryTimer=null)}codexLinuxBuildAvatarInputShape(e){let t=this.layout;if(t==null)return null;if(this.dragState!=null){let t=e.getContentBounds();return[{x:0,y:0,width:t.width,height:t.height}]}let r=e.getContentBounds(),i=e=>{if(e==null)return null;let t=Math.max(0,e.left),n=Math.max(0,e.top),i=Math.min(r.width,e.left+e.width)-t,a=Math.min(r.height,e.top+e.height)-n;return i<=0||a<=0?null:{x:t,y:n,width:i,height:a}};return[i(t.mascot),i(t.tray)].filter(Boolean)}codexLinuxApplyAvatarInputShape(e){if(process.platform!==`linux`||e==null||e.isDestroyed()||typeof e.setShape!=`function`)return!1;let t=this.codexLinuxBuildAvatarInputShape(e);if(t==null)return!1;let n=JSON.stringify(t);if(this.codexLinuxAvatarInputShapeKey===n)return!0;try{e.setShape(t),this.codexLinuxAvatarInputShapeKey=n;return!0}catch{this.codexLinuxAvatarInputShapeKey=null;return!1}}codexLinuxStartAvatarPassthroughRecovery(){if(process.platform!==`linux`||this.codexLinuxAvatarPassthroughRecoveryTimer!=null)return;this.codexLinuxAvatarPassthroughRecoveryTimer=setInterval(()=>{let e=this.window;if(e==null||e.isDestroyed()||!e.isVisible()){this.codexLinuxStopAvatarPassthroughRecovery();return}this.codexLinuxSyncAvatarPointerInteractivity(e)&&this.applyPointerInteractivityPolicy()},32),this.codexLinuxAvatarPassthroughRecoveryTimer.unref?.()}codexLinuxSyncAvatarPointerInteractivity(e){if(process.platform!==`linux`||e==null||e.isDestroyed())return!1;if(this.dragState!=null){if(this.pointerInteractive)return!1;return this.pointerInteractive=!0,!0}let t;try{t=this.codexLinuxIsCursorInAvatarInteractiveRegion(e)}catch{t=!0}return this.pointerInteractive===t?!1:(this.pointerInteractive=t,!0)}codexLinuxIsCursorInAvatarInteractiveRegion(e){let t=this.layout;if(t==null)return!1;let r=n.screen.getCursorScreenPoint(),i=e.getContentBounds(),a=r.x-i.x,o=r.y-i.y;if(a<0||o<0||a>i.width||o>i.height)return!1;let s=e=>e!=null&&a>=e.left&&a<=e.left+e.width&&o>=e.top&&o<=e.top+e.height;return s(t.mascot)||s(t.tray)}refreshCursorAtCurrentMousePosition(e){";
  const interactivityPatch = previousShapeInteractivityNeedle
    .replace(
      "codexLinuxStopAvatarPassthroughRecovery(){",
      `${i3SessionMethod}${compositorHintsMethod}codexLinuxStopAvatarPassthroughRecovery(){`,
    );
  const previousI3AlwaysInteractivePatch =
    "if(process.platform===`linux`&&this.codexLinuxIsI3Session()){this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.pointerInteractive=!0,this.mousePassthroughEnabled&&(this.mousePassthroughEnabled=!1),e.setIgnoreMouseEvents(!1);return}";
  const previousI3SetShapeGuardPatch =
    "if(process.platform===`linux`&&typeof e.setShape==`function`&&!this.codexLinuxIsI3Session()){";

  if (!patchedSource.includes("codexLinuxIsI3Session")) {
    if (patchedSource.includes(interactivityNeedle)) {
      patchedSource = patchedSource.replace(interactivityNeedle, interactivityPatch);
    } else if (patchedSource.includes(previousInteractivityNeedle)) {
      patchedSource = patchedSource.replace(previousInteractivityNeedle, interactivityPatch);
    } else if (patchedSource.includes(previousSyncInteractivityNeedle)) {
      patchedSource = patchedSource.replace(previousSyncInteractivityNeedle, interactivityPatch);
    } else if (patchedSource.includes(previousShapeInteractivityNeedle)) {
      patchedSource = patchedSource.replace(previousShapeInteractivityNeedle, interactivityPatch);
    } else if (
      patchedSource.includes("avatar-overlay") &&
      patchedSource.includes("applyPointerInteractivityPolicy(){let e=this.window")
    ) {
      console.warn(
        "WARN: Could not find avatar overlay mouse passthrough policy — skipping Linux avatar overlay passthrough recovery patch",
      );
      return currentSource;
    }
  }
  if (
    patchedSource.includes("codexLinuxIsI3Session") &&
    !patchedSource.includes("codexLinuxApplyAvatarCompositorHints")
  ) {
    patchedSource = patchedSource.replace(
      `${i3SessionMethod}codexLinuxStopAvatarPassthroughRecovery(){`,
      `${i3SessionMethod}${compositorHintsMethod}codexLinuxStopAvatarPassthroughRecovery(){`,
    );
  }
  if (
    previousCompositorHintsMethod != null &&
    patchedSource.includes(previousCompositorHintsMethod) &&
    !patchedSource.includes("`xwininfo`,[`-id`,")
  ) {
    patchedSource = patchedSource.replace(previousCompositorHintsMethod, compositorHintsMethod);
  }
  if (
    previousUnscopedCompositorHintsMethod != null &&
    patchedSource.includes(previousUnscopedCompositorHintsMethod) &&
    !patchedSource.includes("`xwininfo`,[`-id`,")
  ) {
    patchedSource = patchedSource.replace(previousUnscopedCompositorHintsMethod, compositorHintsMethod);
  }
  if (patchedSource.includes(previousI3AlwaysInteractivePatch)) {
    patchedSource = patchedSource.replace(previousI3AlwaysInteractivePatch, "");
  }
  if (patchedSource.includes(previousI3SetShapeGuardPatch)) {
    patchedSource = patchedSource.replace(
      previousI3SetShapeGuardPatch,
      "if(process.platform===`linux`&&typeof e.setShape==`function`){",
    );
  }

  const previousStartDragPatch =
    "startDrag(e,{pointerWindowX:t,pointerWindowY:r}){let i=this.window;if(i==null||i.isDestroyed()||i.webContents.id!==e)return;this.pointerInteractive=!0,this.applyPointerInteractivityPolicy(),this.cancelMomentum();";
  const originalStartDragPrefix =
    "startDrag(e,{pointerWindowX:t,pointerWindowY:r}){let i=this.window;if(i==null||i.isDestroyed()||i.webContents.id!==e)return;this.cancelMomentum();";
  // The dragState assignment closes with `...getCursorScreenPoint()).bounds}`
  // immediately followed by `}moveDrag(<arg>){`. The electron screen alias
  // (`n`→`i`) and the moveDrag parameter drift, so anchor on the stable tail
  // and inject the Linux pointer-interactivity refresh into the close.
  const startDragTailRegex =
    /(getCursorScreenPoint\(\)\)\.bounds)\}\}moveDrag\(([A-Za-z_$][\w$]*)\)\{/;
  const startDragAlreadyPatched =
    /getCursorScreenPoint\(\)\)\.bounds\},process\.platform===`linux`&&\(this\.pointerInteractive=!0,this\.applyPointerInteractivityPolicy\(\)\)\}moveDrag\(/.test(
      patchedSource,
    );
  if (patchedSource.includes(previousStartDragPatch)) {
    patchedSource = patchedSource.replace(previousStartDragPatch, originalStartDragPrefix);
  }
  if (startDragAlreadyPatched) {
    // Already patched.
  } else if (startDragTailRegex.test(patchedSource)) {
    patchedSource = patchedSource.replace(
      startDragTailRegex,
      (_match, boundsTail, moveDragArg) =>
        `${boundsTail}},process.platform===\`linux\`&&(this.pointerInteractive=!0,this.applyPointerInteractivityPolicy())}moveDrag(${moveDragArg}){`,
    );
  } else if (patchedSource.includes("avatar-overlay")) {
    console.warn(
      "WARN: Could not find avatar overlay drag start — skipping Linux avatar overlay drag interactivity patch",
    );
  }

  const endDragNeedle =
    "endDrag(e){let t=this.window;t==null||t.isDestroyed()||t.webContents.id!==e||(this.dragState?.hasMoved&&this.moveDragToCurrentCursor(t),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0}))}";
  const endDragPatch =
    "endDrag(e){let t=this.window;t==null||t.isDestroyed()||t.webContents.id!==e||(this.dragState?.hasMoved&&this.moveDragToCurrentCursor(t),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0}),process.platform===`linux`&&this.applyPointerInteractivityPolicy())}";
  const previousEndDragPatch =
    "endDrag(e){let t=this.window;t==null||t.isDestroyed()||t.webContents.id!==e||(this.dragState?.hasMoved&&this.moveDragToCurrentCursor(t),this.dragState=null,this.reclampWindowToVisibleDisplay({shouldPersist:!0}),this.codexLinuxSyncAvatarPointerInteractivity(t)&&this.applyPointerInteractivityPolicy())}";
  if (patchedSource.includes(previousEndDragPatch)) {
    patchedSource = patchedSource.replace(previousEndDragPatch, endDragPatch);
  } else if (patchedSource.includes(endDragNeedle)) {
    patchedSource = patchedSource.replace(endDragNeedle, endDragPatch);
  } else if (
    patchedSource.includes("avatar-overlay") &&
    !patchedSource.includes(endDragPatch)
  ) {
    console.warn(
      "WARN: Could not find avatar overlay drag end — skipping Linux avatar overlay drag cleanup patch",
    );
  }

  // setElementSize gained extra upstream logic (mascot-resize state machine),
  // but every code path that actually applies the layout still ends with
  // `this.mascotSize=<m>,this.traySize=<t>,this.applyLayout(<win>)` followed by
  // the method-closing braces. Anchor on that apply-layout tail and append the
  // Linux pointer-interactivity refresh right after it. The trailing brace count
  // varies (`)}` in old single-expression bodies, `)}}` in the newer wrapped
  // body), so capture it and re-emit verbatim.
  const previousSetElementSizePatch =
    "setElementSize(e,{mascot:t,tray:n}){let r=this.window;r==null||r.isDestroyed()||r.webContents.id!==e||(this.cancelMomentum(),this.anchor={...this.anchor,width:t.width,height:t.height},this.mascotSize=t,this.traySize=n,this.applyLayout(r),this.codexLinuxSyncAvatarPointerInteractivity(r)&&this.applyPointerInteractivityPolicy())}";
  const setElementSizePatch =
    "setElementSize(e,{mascot:t,tray:n}){let r=this.window;r==null||r.isDestroyed()||r.webContents.id!==e||(this.cancelMomentum(),this.anchor={...this.anchor,width:t.width,height:t.height},this.mascotSize=t,this.traySize=n,this.applyLayout(r),process.platform===`linux`&&this.applyPointerInteractivityPolicy())}";
  const setElementSizeTailRegex =
    /(setElementSize\(e,\{mascot:t,tray:([A-Za-z_$][\w$]*)\}\)\{[\s\S]*?this\.mascotSize=t,this\.traySize=\2,this\.applyLayout\(([A-Za-z_$][\w$]*)\))(\)?\}\}?)/;
  const setElementSizeAlreadyPatched =
    /this\.applyLayout\([A-Za-z_$][\w$]*\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\)/.test(
      patchedSource,
    );
  if (patchedSource.includes(previousSetElementSizePatch)) {
    patchedSource = patchedSource.replace(previousSetElementSizePatch, setElementSizePatch);
  } else if (setElementSizeAlreadyPatched) {
    // Already patched.
  } else if (setElementSizeTailRegex.test(patchedSource)) {
    patchedSource = patchedSource.replace(
      setElementSizeTailRegex,
      (_match, head, _trayVar, winVar, closer) =>
        `${head},process.platform===\`linux\`&&this.applyPointerInteractivityPolicy()${closer}`,
    );
  } else if (patchedSource.includes("avatar-overlay")) {
    console.warn(
      "WARN: Could not find avatar overlay element size update — skipping Linux avatar overlay layout interactivity patch",
    );
  }

  const createWindowHintsNeedle =
    "return this.window=t,this.rendererReady=this.windowManager.isWebContentsReady(t.webContents.id),";
  const createWindowHintsPatch =
    "return this.window=t,this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.rendererReady=this.windowManager.isWebContentsReady(t.webContents.id),";
  const previousCreateWindowCompositorPatch =
    "return this.window=t,this.codexLinuxApplyAvatarCompositorHints(t),this.rendererReady=this.windowManager.isWebContentsReady(t.webContents.id),";
  const previousCreateWindowCompositorResetPatch =
    "return this.window=t,this.codexLinuxAvatarCompositorHintsApplied=!1,process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(t),this.rendererReady=this.windowManager.isWebContentsReady(t.webContents.id),";
  if (
    !patchedSource.includes("this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.rendererReady") &&
    patchedSource.includes(previousCreateWindowCompositorResetPatch)
  ) {
    patchedSource = patchedSource.replace(
      previousCreateWindowCompositorResetPatch,
      createWindowHintsPatch,
    );
  } else if (
    !patchedSource.includes("this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.rendererReady") &&
    patchedSource.includes(previousCreateWindowCompositorPatch)
  ) {
    patchedSource = patchedSource.replace(
      previousCreateWindowCompositorPatch,
      createWindowHintsPatch,
    );
  } else if (
    !patchedSource.includes("this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.rendererReady") &&
    patchedSource.includes(createWindowHintsNeedle)
  ) {
    patchedSource = patchedSource.replace(createWindowHintsNeedle, createWindowHintsPatch);
  }

  const i3TrayFallbackRegex =
    /traySize:this\.traySize\?\?([A-Za-z_$][\w$]*)\}\);this\.anchor=/;
  const i3TrayFallbackPatch =
    "traySize:process.platform===`linux`&&typeof this.codexLinuxIsI3Session==`function`&&this.codexLinuxIsI3Session()?this.traySize:this.traySize??$1});this.anchor=";
  if (
    !patchedSource.includes(
      "traySize:process.platform===`linux`&&typeof this.codexLinuxIsI3Session==`function`&&this.codexLinuxIsI3Session()",
    )
  ) {
    if (i3TrayFallbackRegex.test(patchedSource)) {
      patchedSource = patchedSource.replace(i3TrayFallbackRegex, i3TrayFallbackPatch);
    } else if (patchedSource.includes("avatar-overlay")) {
      console.warn(
        "WARN: Could not find avatar overlay default tray layout — skipping Linux i3 hidden tray layout patch",
      );
    }
  }

  // applyLayout ends with `this.sendLayoutToRenderer(<win>)}getLayout(...)`.
  // The layout var (`r`→`i`) drifts, `setWindowBounds` gained an extra arg, and
  // the `getLayout` parameter varies, so anchor on the `sendLayoutToRenderer`
  // call that precedes the `getLayout` boundary and inject before the closing
  // brace.
  const applyLayoutTailRegex =
    /(this\.sendLayoutToRenderer\(([A-Za-z_$][\w$]*)\))\}getLayout\(([A-Za-z_$][\w$]*)\)\{/;
  const applyLayoutAlreadyPatched =
    /this\.sendLayoutToRenderer\([A-Za-z_$][\w$]*\),process\.platform===`linux`&&this\.applyPointerInteractivityPolicy\(\)\}getLayout\(/.test(
      patchedSource,
    );
  if (applyLayoutAlreadyPatched) {
    // Already patched.
  } else if (applyLayoutTailRegex.test(patchedSource)) {
    patchedSource = patchedSource.replace(
      applyLayoutTailRegex,
      (_match, sendCall, _winVar, getLayoutArg) =>
        `${sendCall},process.platform===\`linux\`&&this.applyPointerInteractivityPolicy()}getLayout(${getLayoutArg}){`,
    );
  } else if (patchedSource.includes("avatar-overlay")) {
    console.warn(
      "WARN: Could not find avatar overlay layout application — skipping Linux avatar overlay layout sync patch",
    );
  }

  const showWindowNeedle =
    "e.moveTop(),e.showInactive(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const showWindowPatch =
    "e.moveTop(),e.showInactive(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowCompositorPatch =
    "e.moveTop(),process.platform===`linux`&&this.codexLinuxApplyAvatarCompositorHints(e),e.showInactive(),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowI3Patch =
    "e.moveTop(),e.showInactive(),process.platform===`linux`&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  const previousShowWindowPatch =
    "e.moveTop(),e.showInactive(),process.platform===`linux`&&this.codexLinuxStartAvatarPassthroughRecovery(),this.codexLinuxSyncAvatarPointerInteractivity(e)&&this.applyPointerInteractivityPolicy(),!t&&this.isOpen()&&this.broadcastOpenState()}broadcastOpenState(){";
  if (patchedSource.includes(previousShowWindowCompositorPatch)) {
    patchedSource = patchedSource.replace(previousShowWindowCompositorPatch, showWindowPatch);
  } else if (patchedSource.includes(previousShowWindowPatch)) {
    patchedSource = patchedSource.replace(previousShowWindowPatch, showWindowPatch);
  } else if (patchedSource.includes(previousShowWindowI3Patch)) {
    patchedSource = patchedSource.replace(previousShowWindowI3Patch, showWindowPatch);
  } else if (patchedSource.includes(showWindowNeedle)) {
    patchedSource = patchedSource.replace(showWindowNeedle, showWindowPatch);
  } else if (
    patchedSource.includes("avatar-overlay") &&
    !patchedSource.includes(showWindowPatch)
  ) {
    console.warn(
      "WARN: Could not find avatar overlay show window — skipping Linux avatar overlay show sync patch",
    );
  }

  // The closed-window guard parameter drifts (`t`→`e`). Capture it so the
  // injected cleanup statements reference the same window variable.
  const closedNeedleRegex =
    /this\.window===([A-Za-z_$][\w$]*)&&\(this\.cancelMomentum\(\),this\.window=null,/;
  const closedVar = patchedSource.match(closedNeedleRegex)?.[1] ?? "t";
  const closedNeedle = `this.window===${closedVar}&&(this.cancelMomentum(),this.window=null,`;
  const closedPatch =
    `this.window===${closedVar}&&(this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.codexLinuxAvatarCompositorHintsApplied=!1,this.codexLinuxAvatarCompositorHintsApplying=!1,this.cancelMomentum(),this.window=null,`;
  const previousCompositorClosedPatch =
    "this.window===t&&(this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.codexLinuxAvatarCompositorHintsApplied=!1,this.cancelMomentum(),this.window=null,";
  const previousClosedPatch =
    "this.window===t&&(this.codexLinuxStopAvatarPassthroughRecovery(),this.cancelMomentum(),this.window=null,";
  const previousShapeClosedPatch =
    "this.window===t&&(this.codexLinuxStopAvatarPassthroughRecovery(),this.codexLinuxAvatarInputShapeKey=null,this.cancelMomentum(),this.window=null,";
  // Var-agnostic already-patched detector: once injected, the cleanup methods
  // sit between `this.window===<var>&&(` and `this.cancelMomentum()`, so the
  // raw `closedNeedle` no longer matches and `closedVar` can mis-resolve. Use a
  // regex on the injected marker instead so re-runs stay idempotent.
  const closedAlreadyPatched =
    /this\.window===[A-Za-z_$][\w$]*&&\(this\.codexLinuxStopAvatarPassthroughRecovery\(\),this\.codexLinuxAvatarInputShapeKey=null,this\.codexLinuxAvatarCompositorHintsApplied=!1,this\.codexLinuxAvatarCompositorHintsApplying=!1,this\.cancelMomentum\(\),this\.window=null,/.test(
      patchedSource,
    );
  if (closedAlreadyPatched) {
    // Already patched.
  } else if (patchedSource.includes(previousCompositorClosedPatch)) {
    patchedSource = patchedSource.replace(previousCompositorClosedPatch, closedPatch);
  } else if (patchedSource.includes(previousClosedPatch)) {
    patchedSource = patchedSource.replace(previousClosedPatch, closedPatch);
  } else if (patchedSource.includes(previousShapeClosedPatch)) {
    patchedSource = patchedSource.replace(previousShapeClosedPatch, closedPatch);
  } else if (patchedSource.includes(closedNeedle)) {
    patchedSource = patchedSource.replace(closedNeedle, closedPatch);
  } else if (
    patchedSource.includes("avatar-overlay") &&
    patchedSource.includes("codexLinuxStartAvatarPassthroughRecovery")
  ) {
    console.warn(
      "WARN: Could not find avatar overlay close cleanup — skipping Linux avatar overlay passthrough cleanup patch",
    );
  }

  return patchedSource;
}

module.exports = {
  applyLinuxAvatarOverlayMousePassthroughPatch,
};
