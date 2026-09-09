# Music-Display Desklet
A Linux Mint Cinnamon Desklet for displaying what is currently being played by Players supporting the MPRIS D-Bus Specification such as Rhythmbox, Firefox, Spotify, and more, using the playerctl command-line utility.
## Instillation
Go to your Desklets folder `~/.local/share/cinnamon/desklets` (or create it if it doesn't exist) and run `git clone https://github.com/NicholasJDi/Music-Display-Desklet`, go inside the generated folder and drag out the `music-display@nicholasjdi` folder into the Desklets folder and delete the `Music-Display-Desklet` folder, run `sudo apt install playerctl` and you should be good to go! (of course enable the Desklet)

I'm not sure what versions this is supported by so any help figuring that out would be appreciated, but i built this on Linux Mint 22.2 with Cinnamon 6.4.8 sorry if this doesn't work on your version.
## Configuration
Desklet looks like this by default:<br>
<img width="164" height="98" alt="Screenshot from 2025-09-08 08-43-38" src="https://github.com/user-attachments/assets/c7ed5d39-02f2-465a-8b24-719284d118dd" />

You can fully configure both text lines, you can do something like this:<br>
<img width="242" height="78" alt="Screenshot from 2025-09-08 08-50-30" src="https://github.com/user-attachments/assets/2858b670-cd22-4200-aea3-288e345a4a41" /><br><br>

For both lines you can change: format, font, font size, and font color.

### Format
#### Tags
The Tags System is VERY powerful, they are formatted as `%{prefix}[player]metadata:key{suffix}%`
##### metadata:key
The Metadata Key to grab from, if `metadata:` is not provided it will be treated as `xesam:tag` automatically,<br>
additionally there a few built-in tags.<br>
- title: shows `xesam:title` unless [Mix Detection](#mix-detection) is enabled and the track is recognized as a mix, then it will display the Mix Title.<br>
- mix: displays nothing unless [Mix Detection](#mix-detection) is enabled and the track is recognized as a mix, then it will display `xesam:title`.<br>
- player: displays the name of the current player.<br>
(built-in tags are used as `%title%`, metadata:key is the only required section of the tag.)<br>

The functions and variables that playerctl provides are also supported (lc(xesam:title), uc(xesam:album), position, volume), If you set metadata:tag to be `(anything)` whatever you put in the brackets will be directly given to playerctl so you can do things like `%(position / 1000000)%` to get seconds.<br>
Prefix metadata:tag with `!` to ignore the [Empty Values](#empty-values).

Run `playerctl metadata` to show Metadata for the current Track.
##### [player]
The Player(s) the Track must be played from for a tag to activate, don't include to allow the tag to activate for all Players. (the current player is the same as %player%)<br>
Prefix `[player]` with `!` to make it a blacklist instead of a whitelist. (`![vlc,spotify]`)
##### {prefix}/{suffix}
If metadata:key equates to a valid Value {prefix} will be Prepended to the tag and {suffix} will be Appended to the tag. (prefix/suffix can have Tags within them. `%{by }artist{%( - )album%}%`)
##### Conditional Tags
To make a tag conditional prefix metadata:tag with `?`, this makes it so anything placed in {prefix} will be shown if metadata:tag evaluates to a valid Value.<br>
If metadata:tag is instead prefixed with `??` the condition will be inversed (prefix shown when metadata:tag evaluates to an invalid Value)<br>

In a Conditional Tag anything placed in the {suffix} will be compared to what metadata:tag evaluates to, tags within the match suffix will be treated as plain text.<br>
If the comparison succeeds {prefix} will be shown, [Empty Values](#empty-values) are always ignored in match tags, to make them ignored in normal conditional tags prefix metadata:tag with `!` as well (`!?`). (adding a `!` to a match tag makes it respect the [Empty Values](#empty-values) but its not very useful)
#### Example
Using all of these tags we can set line 1 to "%title%" and set line 2 to "%{by }artist{%{ - }album{%{ | %discNumber{-}%}trackNumber%}%}%" to show:<br>
<img width="1366" height="768" alt="Screenshot from 2025-11-30 14-43-59" src="https://github.com/user-attachments/assets/875064dc-e524-465f-878a-70b70ff7601e" /><br>
for Rhythmbox, Firefox and Spotify. (i'm using rhythmbox in these examples. Note: VLC has really bad Metadata support, that's why its not referenced here.)
### Tag Settings
#### Mix Detection
Check 'xesam:comment' for lines formatted as "[(hours):(minutes):(seconds)]: (Title)"

If these lines exist it will replace the %title% with the provided title.<br>
Additionally when enabled, the %mix% tag can be used to grab the xesam:title, if no timestamp lines are provided it will return an empty string.

This can decrease performance a lot.
#### Empty Values
A Comma-separated list of Values to treat as `null` in Custom Format Tags (Unknown,None,N/A,0)
### Player Settings
#### Allowed Players
A Comma-separated list of allowed Players. (rhythmbox,spotify)
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
<img width="248" height="64" alt="image" src="https://github.com/user-attachments/assets/553941d4-68ae-495c-b44b-d9f1a6f694e3" />
#### Play/Pause/Next/Previous Button Texture
Custom Texture to use for the Buttons. (forcefully rendered as a square)
## That Should Be All The Important Stuff, I Hope You Enjoy Using This!
Also the inspiration for this is from https://www.reddit.com/r/Minecraft/comments/10br3xj/my_desktop_theme_for_2023 (you can also use Hidamari and dual-datetime@rcalixte to get an almost perfect match to this :D)

If your wondering, this is my desktop: (fonts are Minecraftia and Lobster)<br>
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/586e0ab5-b535-4ed9-8cf0-a2febfbe8418" /><br>
<br><br><br>
# Music-Display Additions
Music-Display Additions is a Sister Desklet of Music-Display Desklet that shows current Time and Art of a Track using similar systems.
## Instillation
Same as Instillation for Music-Display Desklet, just also drag out `music-display-additions@nicholasjdi`.
## Configuration
Music-Display Additions Configuration is quite complex
### Desklet Settings
#### Disabled
Whether or not to Disable the Desklet, this is also in the Context Menu.
#### X/Y Size
The X and Y Size of the Desklet.
### Text Settings
#### Enabled
Whether or not Text is Enabled.
#### Format
%time|(modifier)%, %position|(modifier)%, %length|(modifier)%. (%time%)
##### Modifiers include:
0:00 = 0:01-1:17:03<br>
00:00 = 00:01-1:17:03<br>
00 = 1-1:17:03<br>
0:0 = Adaptive to song length from other modifiers above<br>
0 = 1-1:17:3<br>
(default is 0:00)
#### Font
The Font of the Text.
#### Color
The Color of the Text.
#### Position
The Anchor Position of the Text, Values are: Top Left, Top Right, Bottom Left, Bottom Right, Center.
#### X/Y Offset
The X and Y Offset of the Text from the Anchor Position.
#### No Art Position
The Anchor Position of the Text when no Art is found, (not Art Enabled = false) Values are: Top Left, Top Right, Bottom Left, Bottom Right, Center.
#### No Art X/Y Offset
The X and Y Offset of the Text from the Anchor Position when no Art is found. (not Art Enabled = false) 
#### Keep Text Within Art
Anchor Text within Art when Art is not the same aspect ratio as the Desklet.
#### Outline Enabled
Whether or not Text Outline is Enabled.
#### Outline Size
How large the Text Outline is in Pixels.
#### Outline Color
The Color of the Text Outline.
### Art Settings
#### Enabled
Whether or not Art is Enabled.
#### Margin Size
The size of the Margin around Art.
#### Margin Color
The Color of the Margin around Art.
#### Background Color
The Color above the Margin, behind Art. (for if Art is transparent)
#### Overrides Enabled
Whether or not Per Track Art Overrides are Enabled.
#### Position
The Anchor Position of Art when Art is not the same aspect ratio as the Desklet. (not Art Enabled = false) Values are: Top Left, Top Right, Bottom Left, Bottom Right, Center.
#### Art Override Directory
The Directory to fetch Art Overrides from, Files are formatted as "(Artist) - (Title).png" so "Lemmino - Cipher.png" for example. (jpg and webp are also supported.)
#### Mix Detection
Check 'xesam:comment' for lines formatted as "[(hours):(minutes):(seconds)]: (Title)"

If these lines exist it will use the provided title for overrides.<br>
(this can also be used to set overrides that do not rely on xesam:title which is nice.)

This can decrease performance a lot.
### Player Settings
#### Player Whitelist
A Comma-separated list of allowed Players. (rhythmbox,spotify)
#### Treat Whitelist As Blacklist
Whether or not to treat the Whitelist as a Blacklist
### Example
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/0a3accd3-59ef-4e14-98a0-75a11741e1dc" />
