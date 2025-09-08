# Music Display Desklet
A Linux Mint Cinnamon Desklet for displaying what is currently being played by players supporting the MPRIS D-Bus specification such as Rhythmbox, VLC, Spotify, and more, using the playerctl command-line utility.
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
The Title of the Song.
#### %artist%
The Artitst who made the Song
#### %album%
The Album the Song is from.
#### %player%
The Player the Song is being played from. (rhytmbox,vlc,spotify)
#### %[player] metadata:key%
The Most unique of the format tags, it allows you to define raw metadata to grab based on the Player.
##### [player]
The Player the Song must be played from for this format tag to activate, the same as %player%.
##### metadata:key
The metadata key to grab from. (xesam:trackNumber)
#### Example
Using all of these tags we can set line 1 to "%title%" and set line 2 to "by %artist% from %album% track #%[rhythmbox] xesam:discNumber%%[spotify] xesam:discNumber%-%[rhythmbox] xesam:trackNumber%%[vlc] xesam:tracknumber%%[spotify] xesam:trackNumber%" (vlc doesn't support disc number) to show:<br>
<img width="406" height="72" alt="Screenshot from 2025-09-08 09-18-34" src="https://github.com/user-attachments/assets/4d7c122e-f064-4c3c-9eb1-93e66f5b5087" /><br>
for Rhythmbox, VLC and Spotify. (i'm using rhythmbox in these examples) and people probably won't be using vlc, i probably will remove it from my Whitelist. oh and about Whitelist,
### Player Settings
#### Song Polling Interval
The Interval for how often Song data is updated.
#### Player Polling Interval
The Interval for how often Players are checked for.
#### Allowed Players
A Comma-separated list of allowed Players.
#### Treat Whitelist As Blacklist
Whether or not to treat the Whitelist as a Blacklist
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
(no image cause this setting is broken somehow, i will fix it tomorrow)
#### Play/Pause/Next/Previous Button Texture Path
Path to a Custom Texture for the Buttons. in format file:///home/\<user\>/file_path/image.png 
### That Should Be All The Important Stuff, I Hope You Enjoy Using This! (I Hated Making It, I Spent 24 Hours Strait On It. No Sleep.)
Also the inspiration for this is from https://www.reddit.com/r/Minecraft/comments/10br3xj/my_desktop_theme_for_2023 (you can also use hidamari and duek-datetime to get an almost perfect match to this :D)
