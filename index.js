// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext, loadExtensionSettings, renderExtensionTemplateAsync } from "../../../extensions.js";

//You'll likely need to import some other functions from the main script
import { saveSettingsDebounced, appendMediaToMessage, saveChatConditional, sendMessageAsUser, Generate, is_send_press } from "../../../../script.js";
import { Popup, POPUP_TYPE, POPUP_RESULT } from "../../../popup.js";
import { is_group_generating } from "../../../group-chats.js";
import { saveBase64AsFile } from "../../../utils.js";
import { dragElement } from "../../../RossAscends-mods.js";
import { loadMovingUIState, power_user } from "../../../power-user.js";

// Keep track of where your extension is located, name should match repo name
const extensionName = "video-calls";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
  hide_inline: false,
  auto_interval: 30,
  start_prompt: "[{{user}} has started a video call]",
  end_prompt: "[{{user}} has ended the video call]",
  alarm_start_prompt: "[{{user}}'s alarm is going off! It's time for a video call. {{char}} initiated a video call with {{user}} to help them.\n\n{{user}} left the following note as a reminder: {{alarm_reminder}} ]",
  alarm_default_reminder: "Hey! I'm setting an alarm for the time I need to wake up. Help me wake up, and don't stop calling until you see me front and center in the webcam!",
  image_mode: "captions",
};


 
function getSettingText(key) {
  const raw = String((extension_settings[extensionName] ?? {})[key] ?? "").trim();
  if (raw) return raw;
  const def = String((defaultSettings)[key] ?? "").trim();
  return def;
}

// Generation interceptor for inline mode (mirrors Screen Share behavior)
async function videoCallsInlineInterceptor(chat, _contextSize, _abort, type) {
  try {
    if (String(extension_settings[extensionName].image_mode || 'captions') !== 'inline') return;
    if (type === 'quiet') return;
    if (!Array.isArray(chat) || chat.length === 0) return;
    const last = structuredClone(chat[chat.length - 1]);
    if (!last || !last.is_user) return;
    const captured = await captureWebcamFrame();
    if (!captured) return;
    last.extra = last.extra || {};
    const dataUrl = `data:image/jpeg;base64,${captured.base64}`;
    const { ensureMessageMediaIsArray } = getContext();
    if (typeof ensureMessageMediaIsArray === 'function') {
      ensureMessageMediaIsArray(last);
      if (!Array.isArray(last.extra.media)) last.extra.media = [];
      last.extra.media.push({ url: dataUrl, type: 'image' });
    } else if (!last.extra.image) {
      last.extra.image = dataUrl;
    }
    chat[chat.length - 1] = last;
  } catch (err) {
    console.warn('video-calls inline interceptor failed:', err);
  }
}

window['extension_VideoCalls_interceptor'] = videoCallsInlineInterceptor;

function updateWandStartStop() {
  const item = $("#video_calls_start");
  if (!item.length) return;
  const running = !!videoCallsStream;
  const icon = item.find('.extensionsMenuExtensionButton');
  const label = item.find('span');
  if (running) {
    icon.removeClass('fa-video').addClass('fa-video-slash').attr('title', 'Stop Video').attr('data-i18n', '[title]Stop Video');
    label.text('Stop Video').attr('data-i18n', 'Stop Video');
  } else {
    icon.removeClass('fa-video-slash').addClass('fa-video').attr('title', 'Start Video Call').attr('data-i18n', '[title]Start Video Call');
    label.text('Start Video Call').attr('data-i18n', 'Start Video Call');
  }
}

// Loads the extension settings if they exist, otherwise initializes them to the defaults.
async function loadSettings() {
  //Create the settings if they don't exist
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // Updating settings in the UI
  const hideInline = Boolean(extension_settings[extensionName].hide_inline);
  $("#video_calls_hide_inline").prop("checked", hideInline);
  $(document.body).toggleClass("video-calls-hide-attachments", hideInline);

  const interval = Number(extension_settings[extensionName].auto_interval) || 30;
  $("#video_calls_interval").val(interval);
  $("#video_calls_interval_value").text(String(interval));

  // Prompts
  $("#video_calls_start_prompt").val(getSettingText('start_prompt'));
  $("#video_calls_end_prompt").val(getSettingText('end_prompt'));
  $("#video_calls_alarm_start_prompt").val(getSettingText('alarm_start_prompt'));
  $("#video_calls_alarm_default_reminder").val(getSettingText('alarm_default_reminder'));
  $("#video_calls_image_mode").val(String(extension_settings[extensionName].image_mode || 'captions'));
}

function onIntervalChange(event) {
  let value = Number($(event.target).val());
  if (isNaN(value)) value = 30;
  value = Math.max(5, Math.min(120, value));
  extension_settings[extensionName].auto_interval = value;
  $("#video_calls_interval_value").text(String(value));
  saveSettingsDebounced();
}

function onHideInlineChange(event) {
  const value = Boolean($(event.target).prop("checked"));
  extension_settings[extensionName].hide_inline = value;
  $(document.body).toggleClass("video-calls-hide-attachments", value);
  saveSettingsDebounced();
}

function onStartPromptInput(event) {
  const value = String($(event.target).val() || "");
  extension_settings[extensionName].start_prompt = value;
  saveSettingsDebounced();
}

function onEndPromptInput(event) {
  const value = String($(event.target).val() || "");
  extension_settings[extensionName].end_prompt = value;
  saveSettingsDebounced();
}

function onAlarmStartPromptInput(event) {
  const value = String($(event.target).val() || "");
  extension_settings[extensionName].alarm_start_prompt = value;
  saveSettingsDebounced();
}

function onAlarmDefaultReminderInput(event) {
  const value = String($(event.target).val() || "");
  extension_settings[extensionName].alarm_default_reminder = value;
  saveSettingsDebounced();
}

// This function is called when the extension settings are changed in the UI
 

function onImageModeChange(event) {
  const value = String($(event.target).val() || "captions");
  extension_settings[extensionName].image_mode = value === 'inline' ? 'inline' : 'captions';
  saveSettingsDebounced();
}

let videoCallsStream = null;
let videoCallsAutoTimer = null;
let videoCallsSkipNextAttach = false;
let alarmTimeoutId = null;
let alarmIntervalId = null;
let alarmTarget = null; // Date
let alarmReminderText = "";
let nextStartPromptOverride = null;
let previewResizeActive = false;

function updateAutoButton() {
  const running = !!videoCallsAutoTimer;
  const btn = $("#video_calls_auto");
  if (btn.length) btn.text(running ? "Stop Auto" : "Start Auto");
}

async function autoSendTick() {
  // Ensure webcam has a frame to capture before sending an empty message
  const captured = await captureWebcamFrame();
  if (!captured) return;
  await sendMessageAsUser("", "");
  if (String(extension_settings[extensionName].image_mode || 'captions') === 'inline') {
    const tryGenerate = () => {
      if (is_send_press || is_group_generating) {
        setTimeout(tryGenerate, 200);
        return;
      }
      Generate('normal', { automatic_trigger: true });
    };
    setTimeout(tryGenerate, 250);
  }
}

function startAuto() {
  if (videoCallsAutoTimer) return;
  const seconds = Number(extension_settings[extensionName].auto_interval) || 30;
  videoCallsAutoTimer = setInterval(autoSendTick, seconds * 1000);
  updateAutoButton();
}

function stopAuto() {
  if (videoCallsAutoTimer) {
    clearInterval(videoCallsAutoTimer);
    videoCallsAutoTimer = null;
  }
  updateAutoButton();
}

function onAutoClick() {
  if (videoCallsAutoTimer) stopAuto(); else startAuto();
}

function formatTwo(n) { return n.toString().padStart(2, '0'); }

function to24h(hour12, ampm) {
  const h = Number(hour12);
  const isPM = String(ampm).toLowerCase() === 'pm';
  if (h === 12) return isPM ? 12 : 0;
  return isPM ? h + 12 : h;
}

function formatCountdown(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${formatTwo(hrs)}:${formatTwo(mins)}:${formatTwo(secs)}`;
}

async function ensureAlarmPanel() {
  if (!document.getElementById('video_calls_alarm_panel')) {
    const html = await renderExtensionTemplateAsync("third-party/video-calls", "alarm");
    $(document.body).append(html);
    loadMovingUIState();
    dragElement($("#video_calls_alarm_panel"));
  }
}

async function updateAlarmPanel(show = true) {
  await ensureAlarmPanel();
  const panel = $("#video_calls_alarm_panel");
  if (!alarmTarget) {
    panel.hide();
    return;
  }
  const displayHour12 = ((alarmTarget.getHours() + 11) % 12) + 1;
  const displayMin = formatTwo(alarmTarget.getMinutes());
  const ampm = alarmTarget.getHours() >= 12 ? 'PM' : 'AM';
  $("#video_calls_alarm_target").text(`${displayHour12}:${displayMin} ${ampm}`);
  const remaining = alarmTarget.getTime() - Date.now();
  $("#video_calls_alarm_countdown").text(formatCountdown(remaining));
  if (show) panel.show();
}

function clearAlarm() {
  if (alarmTimeoutId) { clearTimeout(alarmTimeoutId); alarmTimeoutId = null; }
  if (alarmIntervalId) { clearInterval(alarmIntervalId); alarmIntervalId = null; }
  alarmTarget = null;
  $("#video_calls_alarm_panel").hide();
  alarmReminderText = "";
}

async function waitForWebcamReady(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    /** @type {HTMLVideoElement|null} */
    const player = /** @type {HTMLVideoElement} */ (document.getElementById("video_calls_player"));
    if (player && player.videoWidth > 0 && player.videoHeight > 0) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

async function onAlarmFire() {
  alarmTimeoutId = null;
  await updateAlarmPanel(true);
  window.toastr?.['info']("Wakeup Call: time is up!");

  // Start video call if needed
  if (!videoCallsStream) {
    const template = getSettingText('alarm_start_prompt');
    if (template) {
      const reminder = String(alarmReminderText || "");
      const message = template.replaceAll("{{alarm_reminder}}", reminder);
      nextStartPromptOverride = message;
    } else {
      nextStartPromptOverride = null;
    }
    await startVideoCall();
  }

  // Wait for a valid frame
  await waitForWebcamReady(7000);

  // Start auto sending and send one immediately
  startAuto();
  await autoSendTick();
}

async function scheduleAlarm(hour12, minute, ampm) {
  // Clear previous
  if (alarmTimeoutId) { clearTimeout(alarmTimeoutId); alarmTimeoutId = null; }
  if (alarmIntervalId) { clearInterval(alarmIntervalId); alarmIntervalId = null; }

  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(to24h(hour12, ampm), Number(minute));
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  alarmTarget = target;

  const delay = target.getTime() - Date.now();
  alarmTimeoutId = setTimeout(onAlarmFire, delay);
  alarmIntervalId = setInterval(() => { updateAlarmPanel(false); }, 1000);
  await updateAlarmPanel(true);
}

async function openAlarmDialog() {
  const $content = $(`
    <div class="flex-container column" style="gap: 8px; min-width: 260px;">
      <label class="text_label">Time</label>
      <div class="flex-container" style="gap: 8px; align-items: center;">
        <select id="vc_alarm_hour" class="text_pole" style="width: 5em;"></select>
        <span>:</span>
        <select id="vc_alarm_minute" class="text_pole" style="width: 5em;"></select>
        <select id="vc_alarm_ampm" class="text_pole" style="width: 6em;">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <label class="text_label" style="margin-top: 8px;">Reminder</label>
      <textarea id="vc_alarm_reminder" class="text_pole" style="min-height: 80px;"></textarea>
    </div>
  `);

  const hourSel = $content.find('#vc_alarm_hour');
  for (let h = 1; h <= 12; h++) hourSel.append(`<option value="${h}">${h}</option>`);
  const minSel = $content.find('#vc_alarm_minute');
  for (let m = 0; m < 60; m++) minSel.append(`<option value="${m}">${formatTwo(m)}</option>`);

  // Default to next minute
  const now = new Date();
  let defHour = ((now.getHours() + 11) % 12) + 1;
  let defMin = (now.getMinutes() + 1) % 60;
  let defAmpm = now.getHours() >= 12 ? 'PM' : 'AM';
  hourSel.val(String(defHour));
  minSel.val(String(defMin));
  $content.find('#vc_alarm_ampm').val(defAmpm);
  $content.find('#vc_alarm_reminder').val(getSettingText('alarm_default_reminder'));

  const popup = new Popup($content[0], POPUP_TYPE.TEXT, "", { okButton: "Set Alarm", cancelButton: "Cancel" });
  const res = await popup.show();
  if (typeof res === 'number' && res >= POPUP_RESULT.AFFIRMATIVE) {
    const hour = Number(hourSel.val());
    const minute = Number(minSel.val());
    const ampm = String($content.find('#vc_alarm_ampm').val());
    alarmReminderText = String($content.find('#vc_alarm_reminder').val() || "");
    await scheduleAlarm(hour, minute, ampm);
  }
}

async function startVideoCall() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    if (!document.getElementById("video_calls_preview")) {
      const previewHtml = await renderExtensionTemplateAsync("third-party/video-calls", "preview");
      $(document.body).append(previewHtml);
      // Initialize Moving UI support
      loadMovingUIState();
      dragElement($("#video_calls_preview"));
    }
    const preview = $("#video_calls_preview");
    const player = /** @type {HTMLVideoElement} */ (document.getElementById("video_calls_player"));
    if (!videoCallsStream) {
      videoCallsStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    if (player) {
      player.srcObject = videoCallsStream;
    }
    preview.show();
    updateAutoButton();
    updateWandStartStop();

    // Announce start if configured
    let startText = getSettingText('start_prompt');
    if (nextStartPromptOverride !== null) {
      startText = String(nextStartPromptOverride).trim();
      nextStartPromptOverride = null;
    }
    if (startText) {
      videoCallsSkipNextAttach = true;
      await sendMessageAsUser(startText, "");
    }
  } catch (e) {
    console.error(e);
    window.toastr?.['error']("Could not access webcam");
  }
}

async function stopVideoCall() {
  const preview = $("#video_calls_preview");
  const player = /** @type {HTMLVideoElement} */ (document.getElementById("video_calls_player"));
  if (player) {
    player.srcObject = null;
  }
  if (videoCallsStream) {
    try {
      videoCallsStream.getTracks().forEach(t => t.stop());
    } catch {}
    videoCallsStream = null;
  }
  stopAuto();
  preview.hide();
  updateWandStartStop();

  // Announce end if configured
  const endText = getSettingText('end_prompt');
  if (endText) {
    // Send after stopping stream so no snapshot is attached
    videoCallsSkipNextAttach = true;
    await sendMessageAsUser(endText, "");
  }
}

/**
 * Captures a still frame from the active webcam stream.
 * @returns {Promise<{ base64: string } | null>} Base64 (without data URL prefix) or null if not available
 */
async function captureWebcamFrame() {
  /** @type {HTMLVideoElement|null} */
  const player = /** @type {HTMLVideoElement} */ (document.getElementById("video_calls_player"));
  const stream = videoCallsStream || (player && player.srcObject);
  if (!stream || !(player instanceof HTMLVideoElement)) return null;

  if (!player.videoWidth || !player.videoHeight) return null;

  const canvas = document.createElement("canvas");
  canvas.width = player.videoWidth;
  canvas.height = player.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.split(",")[1];
  return { base64 };
}

/**
 * Attaches a webcam snapshot as an inline image to the just-sent user message.
 * @param {number} messageId
 */
async function attachWebcamSnapshotToMessage(messageId) {
  try {
    const { chat, name2, eventSource, event_types, ensureMessageMediaIsArray } = getContext();
    const message = chat?.[messageId];
    if (!message) return;

    // Skip attachment for system prompts we sent ourselves
    if (videoCallsSkipNextAttach) {
      videoCallsSkipNextAttach = false;
      return;
    }

    // Avoid overriding existing media
    if (!message.is_user || message.extra?.image || message.extra?.video) return;

    const wasAutoUserMessage = message.is_user && !message.mes && !!videoCallsAutoTimer;
    const captured = await captureWebcamFrame();
    if (!captured) return;

    const mode = String(extension_settings[extensionName].image_mode || 'captions');
    if (mode === 'inline') {
      return; // Inline mode uses generation interceptor; do not embed to UI
    }
    message.extra = message.extra || {};
    const intendsInline = (mode === 'inline');
    let inlineAllowed = intendsInline;
    const inlineChk = document.getElementById('openai_image_inlining');
    if (inlineChk instanceof HTMLInputElement && intendsInline) {
      inlineAllowed = inlineChk.checked === true;
    }
    if (inlineAllowed) {
      const dataUrl = `data:image/jpeg;base64,${captured.base64}`;
      message.extra.image = dataUrl;
      message.extra.inline_image = true;
      if (typeof ensureMessageMediaIsArray === 'function') {
        ensureMessageMediaIsArray(message);
        if (!Array.isArray(message.extra.media)) message.extra.media = [];
        message.extra.media.push({ url: dataUrl, type: 'image' });
      }
    } else {
      const imagePath = await saveBase64AsFile(captured.base64, name2, "", "jpg");
      if (!imagePath) return;
      message.extra.image = imagePath;
      message.extra.inline_image = true;
    }
    if (wasAutoUserMessage) {
      message.extra.video_calls_auto = true;
    }

    const messageBlock = $(`.mes[mesid="${messageId}"]`);
    appendMediaToMessage(message, messageBlock);
    // Mark this image as belonging to the video-calls extension for targeted styling
    messageBlock.find('.mes_img').addClass('video-calls-inline');
    await saveChatConditional();
    await eventSource.emit(event_types.MESSAGE_FILE_EMBEDDED, messageId);

    // If this was an auto-sent message, prompt the bot for a response automatically
    if (message.extra?.video_calls_auto) {
      const tryGenerate = () => {
        if (is_send_press || is_group_generating) {
          setTimeout(tryGenerate, 200);
          return;
        }
        // Fire and forget; errors are logged by core
        Generate('normal', { automatic_trigger: true });
      };
      setTimeout(tryGenerate, 250);
      // Prevent duplicate triggers
      delete message.extra.video_calls_auto;
    }
  } catch (e) {
    console.error("Failed to attach webcam snapshot:", e);
  }
}

// This function is called when the extension is loaded
jQuery(async () => {
  // This is an example of loading HTML from a file
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);

  // Append settingsHtml to extensions_settings
  // extension_settings and extensions_settings2 are the left and right columns of the settings menu
  // Left should be extensions that deal with system functions and right should be visual/UI related 
  $("#extensions_settings").append(settingsHtml);

  // Bind settings events
  $("#video_calls_hide_inline").on("input", onHideInlineChange);
  $("#video_calls_interval").on("input change", onIntervalChange);
  $("#video_calls_start_prompt").on("input", onStartPromptInput);
  $("#video_calls_end_prompt").on("input", onEndPromptInput);
  $("#video_calls_alarm_start_prompt").on("input", onAlarmStartPromptInput);
  $("#video_calls_alarm_default_reminder").on("input", onAlarmDefaultReminderInput);
  $("#video_calls_image_mode").on("change", onImageModeChange);

  // Load settings when starting things up (if you have any)
  loadSettings();

  const { eventSource, event_types } = getContext();
  eventSource.on(event_types.APP_READY, async () => {
    try {
      if (!document.getElementById("video_calls_start")) {
        const buttonHtml = await renderExtensionTemplateAsync("third-party/video-calls", "button");
        $("#screen_share_wand_container").append(buttonHtml);
      }
      $(document).off("click", "#video_calls_start").on("click", "#video_calls_start", () => { if (videoCallsStream) { stopVideoCall(); } else { startVideoCall(); } });
      $(document).off("click", "#video_calls_stop").on("click", "#video_calls_stop", stopVideoCall);
      $(document).off("click", "#video_calls_auto").on("click", "#video_calls_auto", onAutoClick);
      $(document).off("click", "#video_calls_alarm").on("click", "#video_calls_alarm", openAlarmDialog);
      $(document).off("click", "#video_calls_alarm_clear").on("click", "#video_calls_alarm_clear", clearAlarm);
      updateWandStartStop();

      $(document).off("mousedown", "#video_calls_preview .video-calls-resize-handle").on("mousedown", "#video_calls_preview .video-calls-resize-handle", (e) => {
        const $panel = $("#video_calls_preview");
        if (!$panel.length) return;
        previewResizeActive = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = $panel.width() || 0;
        const startH = $panel.height() || 0;
        const minW = 280;
        const minH = 160;
        const onMove = (ev) => {
          if (!previewResizeActive) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const w = Math.max(minW, startW + dx);
          const h = Math.max(minH, startH + dy);
          $panel.css({ width: w + "px", height: h + "px" });
        };
        const onUp = () => {
          if (!previewResizeActive) return;
          previewResizeActive = false;
          $(document).off("mousemove", onMove);
          $(document).off("mouseup", onUp);
          const w = $panel.width() || 0;
          const h = $panel.height() || 0;
          const name = $panel.attr("id");
          if (name) {
            power_user.movingUIState[name] = power_user.movingUIState[name] || {};
            power_user.movingUIState[name].width = w;
            power_user.movingUIState[name].height = h;
            saveSettingsDebounced();
            const { eventSource: es } = getContext();
            es.emit('resizeUI', name);
          }
        };
        $(document).on("mousemove", onMove);
        $(document).on("mouseup", onUp);
      });
    } catch (e) {
      console.error(e);
    }
  });

  // After the user message is rendered, capture a frame (if webcam active) and attach it inline
  eventSource.on(event_types.USER_MESSAGE_RENDERED, attachWebcamSnapshotToMessage);
});
