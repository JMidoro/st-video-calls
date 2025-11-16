# Video Calls

This extension allows you to have a "video call" with your SillyTavern characters. It allows you to start your webcam and send frames to your model with each message, or automatically send frames on a timer, allowing the character to respond without you having to send a message.

This extension also provides a "Wakeup Call" feature that allows you to schedule a call to start at a specific time, and send an alarm-specific start message.

> "Wake me up! Don't stop until you see me awake on the webcam!"

I highly recommend playing around with the prompts. Some models may need to be "reassured" of the fact that they can conduct video calls or call you awake. YMMV.

## Features

- **Start/Stop Video Call** - opens the webcam and starts sending frames with each message.
- **Auto Send** - sends webcam frames on a configurable timer without having to send a message.
- **Inline vs Captions**  - supports sending images via Inline (requires "Send Inline Images" to be enabled, and a supporting model) or via Image Captions (requires setting up the Image Caption extension)
- **Alarm integration** - Starts a call and sends an alarm-specific "reminder" message to inform your character about the purpose of the call ("wake me up!" etc). Alarm calls automatically start with "Auto Send" enabled.
- **Configurable Messaging** - Allows you to set custom messages when a video call is started or stopped, when an alarm is triggered, or defaults for reminder messages. Defaults are provided for each message type.
- **Hide message attachments** - Allows you to hide image/video/file attachments from the chat UI.

## Installation and Usage

### Installation

- Install/enable from the Extensions panel.
- Reload SillyTavern after updating the extension.
- Ensure that "Send Inline Images" is enabled ( in "AI Response Configuration" settings), or ensure that Image Captioning is set up (in the Extension settings) depending on your chosen image sending mode. If using Image Captioning, ensure that "Automatically Caption Images" is selected.

### Prerequisites

- Latest SillyTavern (staging preferred).
- Browser support for `MediaDevices.getUserMedia` (webcam access).
- For Inline mode: a multimodal model and “Send inline images” enabled in model settings.
- For Captions mode: the Image Caption extension set up.

### How to Use

1. Open the wand menu and press the Video Calls button to start/stop the call.
2. Toggle Auto in the preview panel to send frames on a timer.
3. Choose the image sending mode in the extension settings:
   - Inline: frames are injected to the model input (not shown in chat).
   - Captions: frames are attached to the chat message and shown.
4. Use the Alarm panel to schedule a call start with an alarm-specific start message.

### Wand Button

This extension adds two new buttons to the wand menu:

- Video Calls: Toggles between “Start Video Call” and “Stop Video” depending on active state.
- Wakeup Call: Opens the alarm panel to set a time and reminder message.

## Settings

- Hide message attachments: hides image/video/file attachments from the message UI.
- Start call message: message sent when a call starts.
- End call message: message sent when a call ends.
- Auto-send interval: seconds between frames when Auto is on.
- Alarm start prompt template: template for the alarm-triggered start message.
- Alarm default reminder: reminder text prefilled in the alarm popup.
- Image sending mode: Inline or Captions.

## Alarm Integration

- Open the Alarm panel, set a time and optional reminder.
- When the alarm fires, the extension starts a call, sends the alarm start message (reminder injected into the template), and begins auto-sending based on your settings.

## Inline Image Mode

- Frames are injected into the model input, not displayed in chat.
- Requires a multimodal model and “Send inline images” enabled in model settings.

## Privacy

- In Inline mode, frames are not stored or rendered in chat. They are only passed to your API provider as part of the request.

## Support and Contributions

- File issues or suggestions in the main project repository.
- PRs welcome for bug fixes, compatibility, and UI polish.

## License

AGPLv3 is recommended to match SillyTavern ecosystem conventions. If you distribute a fork, include a LICENSE file.
