# Music Display Desklet
A Linux Mint Cinnamon Desklet for displaying what is currently being played by players supporting the MPRIS D-Bus specification such as Rhythmbox, Firefox, Spotify, and more, using the playerctl command-line utility.

Note: The Code is really messy cause i do NOT know Javascript, this is my first time ever using it. (i know even less about CJS) But it works and i'm happy with it :D (also this was made with quite a lot of help from ChatGPT, i did do a lot myself though)
## Instillation
Go to your Desklets folder `~/.local/share/cinnamon/desklets` (or create it if it doesn't exist) and run `git clone https://github.com/NicholasJDi/Music-Display-Desklet` go inside the folder and drag out the `music-display@nicholasjdi` folder into the Desklets folder and delete the Music-Display-Desklet folder, run `sudo apt install playerctl` and you should be good to go! (of course enable the Desklet)

I'm not sure what versions this is supported by so any help figuring that out would be appreciated, but i built this on Linux Mint 21.3 with Cinnamon 6.0.4 sorry if this doesn't work on your version.
## Configuration
Music Display Desklet is as configurable as i could get it. (without it being really performance heavy) 

Desklet looks like this by default:<br>
<img width="164" height="98" alt="Screenshot from 2025-09-08 08-43-38" src="https://github.com/user-attachments/assets/c7ed5d39-02f2-465a-8b24-719284d118dd" />

You can fully configure both text lines, you can do something like this:<br>
<img width="242" height="78" alt="Screenshot from 2025-09-08 08-50-30" src="https://github.com/user-attachments/assets/2858b670-cd22-4200-aea3-288e345a4a41" />

For both lines you can change: format, font, and font size.

### Format
#### %title%
The Title of the Track.
#### %artist%
The Artist who made the Track.
#### %album%
The Album the Track is from.
#### %player%
The Player the Track is being played from. (rhytmbox,firefox,spotify. Note: this is the only Tag that is processed when the Player is Stopped)
#### Custom Tags
Custom Tags are VERY powerful, they are formatted as %(prefix)[player]metadata:key(suffix)%
##### (prefix)/(suffix)
If metadata:key returns a valid Value (prefix) will be Prepended to the Tag and (suffix) will be Appended to the Tag. (prefix/suffix can have Custom Tags within them.)
##### [player]
The Player the Track must be played from for a Custom Tag to activate, leave empty to allow the Tag to activate for all Players (the same as %player%)
##### metadata:key
The Metadata Key to grab from. (xesam:trackNumber)<br>
Run: `playerctl metadata` to show Metadata for the current Track.
#### Example
Using all of these tags we can set line 1 to "%title%" and set line 2 to "%(by )[]xesam:artist(%( - )[]xesam:album(%( #%()[]xesam:discNumber(-)%)[]xesam:trackNumber()%)%)%" to show:<br>
<img width="402" height="68" alt="image" src="https://github.com/user-attachments/assets/6e3b9717-c992-4889-b1ea-9eeaa85620cc" /><br>
for Rhythmbox, Firefox and Spotify. (i'm using rhythmbox in these examples. Note: VLC has really bad Metadata support, that's why its not referenced here.)
### Player Settings
#### Track Polling Interval
The Interval for how often Track data is updated. (Playing/Paused)
#### Player Polling Interval
The Interval for how often Players are checked for. (No Player/Stopped)
#### Allowed Players
A Comma-separated list of allowed Players. (rhythmbox,spotify)
#### Treat Whitelist As Blacklist
Whether or not to treat the Whitelist as a Blacklist
#### Empty Values
A Comma-separated list of Values to treat as `null` in Custom Format Tags (Unknown,None,N/A,0)
### Button Settings
#### Spacing
The Space between the Buttons and the Text.
#### Hide All Buttons
Makes it so none of the Buttons are there, just the Text.<br>
<img width="207" height="68" alt="Screenshot from 2025-09-08 09-38-04" src="https://github.com/user-attachments/assets/cdc0256b-f4a6-4e90-8a5a-620e80a81a79" />
#### Hide Skip Buttons
Hide the Previous/Next Buttons, without setting Button Size it will look like this:<br>
<img width="246" height="86" alt="image" src="https://github.com/user-attachments/assets/0b7090d3-2433-437e-8edf-4ae520925b5a" />
#### Button Size
The size of the Buttons, when setting this with hidden skip buttons it looks like this:<br>
<img width="248" height="64" alt="image" src="https://github.com/user-attachments/assets/553941d4-68ae-495c-b44b-d9f1a6f694e3" />
#### Play/Pause/Next/Previous Button Texture
Custom Texture to use for the Buttons. (forcefully rendered as a square)
## That Should Be All The Important Stuff, I Hope You Enjoy Using This!
Also the inspiration for this is from https://www.reddit.com/r/Minecraft/comments/10br3xj/my_desktop_theme_for_2023 (you can also use hidamari and duel-datetime to get an almost perfect match to this :D)

if your wondering, this is my desktop:<br>
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/cc11758e-1f8a-448f-9da6-654ec6613bec" />
