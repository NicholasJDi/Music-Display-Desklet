const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const Pango = imports.gi.Pango;
const Soup = imports.gi.Soup;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Clutter = imports.gi.Clutter;
const Cogl = imports.gi.Cogl;

function MusicDisplayAdditionsDesklet(metadata, instance_id) {
	this._init(metadata, instance_id);
}

MusicDisplayAdditionsDesklet.prototype = {
	__proto__: Desklet.Desklet.prototype,

	_init: function (metadata, instance_id) {
		Desklet.Desklet.prototype._init.call(this, metadata, instance_id);
		this.metadata = metadata;

		// Defaults
		this.xSize = 200;
		this.ySize = 200;
		this.position = "bottom_left";
		this.xOffset = 10;
		this.yOffset = -10;
		this.marginSize = 5;
		this.marginColor = "white";
		this.backgroundColor = "black";
		this.timeFormat = "%time%";
		this.font = "sans 12";
		this.color = "white";
		this.textEnabled = true;
		this.artEnabled = true;
		this.artPosition = "top_right";
		this.textInArt = true;
		this.pollInterval = 0.5;
		this.idlePollInterval = 3;
		this.playerWhitelist = "rhythmbox,spotify";
		this.treatWhitelistAsBlacklist = false;
		this.debugMode = false;
		this.overridesEnabled = false;
		this.overridesDirectory = "";
		this.mixDetection = false;
		this.disabled = false;
		this.noArtPosition = "top_right";
		this.noArtXOffset = -4;
		this.noArtYOffset = 4;
		this.outlineEnabled = false;
		this.outlineSize = "4";
		this.outlineColor = "black";

		// Constants
		this.PLAYERCTL_END = '⹳Ḓ聉飪狮୳欖叁⚟ᦎ멭஺莎혠濨';
		this.PLAYERCTL_SPLIT = 'ꡉ弄⛟퐂�掙᭻淛ᛈ䔻뇉况륚賈';

		// Cache
		this._soupSession = new Soup.Session();
		this._playerctlProcesses = {};
		this._playerctlArgs = [];
		this._metadata = {};
		this._metadataTags = [];
		this._failArt = false;
		this._imageSize = {width: 10, height: 10};
		this._artSize = null;

		// Soft Cache
		this._lastArtUrl = null;
		this._lastTimeText = null;
		this._lastMixTitle = null;

		// Settings
		this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, instance_id);
		this._bindSettings();

		// Layout
		this.container = new St.Widget({ reactive: true });
		this.setContent(this.container);

		// Art outline margin
		this.margin = new St.Widget({ reactive: true });
		this.container.add_actor(this.margin);

		// Art backdrop
		this.backdrop = new St.Widget({ reactive: true});
		this.container.add_actor(this.backdrop);

		// Art
		this.art = new St.Widget({ reactive: true });
		this.container.add_actor(this.art);

		// Outline Labels
		this.outlineContainer = new St.Widget({ reactive: true });
		this.container.add_actor(this.outlineContainer);

		this.outlineLabels = [
			new St.Label({ text: "", style: "" }),
			new St.Label({ text: "", style: "" }),
			new St.Label({ text: "", style: "" }),
			new St.Label({ text: "", style: "" })
		];
		for (let i = 0; i < 4; i++) {
			this.outlineContainer.add_actor(this.outlineLabels[i]);
		}

		// Time Label
		this.timeLabel = new St.Label({ text: "", style: "" });
		this.container.add_actor(this.timeLabel);

		// Context Menu
		this.checkbox = new PopupMenu.PopupSwitchMenuItem("Disabled",this.disabled);
		this.checkbox.connect("toggled", Lang.bind(this, this.on_checkbox_toggled));
		this._menu.addMenuItem(this.checkbox);

		this.overridesCheckbox = new PopupMenu.PopupSwitchMenuItem("Art Overrides",this.overridesEnabled);
		this.overridesCheckbox.connect("toggled", Lang.bind(this, this.on_overridesCheckbox_toggled));
		this._menu.addMenuItem(this.overridesCheckbox);

		this.failCheckbox = new PopupMenu.PopupSwitchMenuItem("Fail Art",this._failArt);
		this.failCheckbox.connect("toggled", Lang.bind(this, this.on_failCheckbox_toggled));
		this._menu.addMenuItem(this.failCheckbox);

		this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this._menu.addAction(_('Reload'), Lang.bind(this, this._reload));

		// Initial setup
		let timeout = GLib.timeout_add(
			GLib.PRIORITY_DEFAULT_IDLE,
			0,
			Lang.bind(this, function () {
				if (timeout) {
					GLib.source_remove(timeout);
					timeout = null;
				}
				this._reload();
			})
		);
	},

	_bindSettings: function () {
		const settings = this.settings;
		const bind = Lang.bind;

		// Desklet Settings
		settings.bind("disabled", "disabled", bind(this, this._reload));
		settings.bind("x_size", "xSize", bind(this, this._updateLayout));
		settings.bind("y_size", "ySize", bind(this, this._updateLayout));

		settings.bind("player_whitelist", "playerWhitelist", bind(this, this._reload));
		settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", bind(this, this._reload));

		settings.bind("debug_mode", "debugMode", null);


		// Text Settings
		settings.bind("text_enabled", "textEnabled", bind(this, this._reload));
		settings.bind("format", "timeFormat", bind(this, this._updateTime));
		settings.bind("font", "font", bind(this, this._updateFont));
		settings.bind("color", "color", bind(this, this._updateFont));
		settings.bind("position", "position", bind(this, this._positionLabel));
		settings.bind("x_offset", "xOffset", bind(this, this._positionLabel));
		settings.bind("y_offset", "yOffset", bind(this, this._positionLabel));

		settings.bind("no_art_position", "noArtPosition", bind(this, this._positionLabel));
		settings.bind("no_art_x_offset", "noArtXOffset", bind(this, this._positionLabel));
		settings.bind("no_art_y_offset", "noArtYOffset", bind(this, this._positionLabel));
		settings.bind("text_in_art", "textInArt", bind(this, this._positionLabel));

		settings.bind("outline_enabled", "outlineEnabled", bind(this, this._updateTime));
		settings.bind("outline_size", "outlineSize", bind(this, this._positionLabel));
		settings.bind("outline_color", "outlineColor", bind(this, this._updateFont));


		// Art Settings
		settings.bind("art_enabled", "artEnabled", bind(this, this._reload));
		settings.bind("margin", "marginSize", bind(this, this._updateLayout));
		settings.bind("margin_color", "marginColor", bind(this, this._updateLayout));
		settings.bind("background_color", "backgroundColor", bind(this, this._updateLayout));
		settings.bind("art_position", "artPosition", bind(this, this._updateLayout));

		settings.bind("overrides_enabled", "overridesEnabled", bind(this, this._reload));
		settings.bind("art_dir", "overridesDirectory", bind(this, this._updateStatus));
		settings.bind("mix_detection", "mixDetection", bind(this, this._reload));
	},

	_checkPlayerctlInstalled: function () {
		return !!GLib.find_program_in_path("playerctl");
	},

	_getPlayerctlArgs: function () {
		this._playerctlArgs = [
			(this.treatWhitelistAsBlacklist ?
				'--ignore-player=' :
				'--player=') +
				this.playerWhitelist.split(",")
					.map(s => s.trim())
					.filter(Boolean)
					.join(',')
		];
	},

	_startPlayerctl: function (id, argsArray, callback, multiLine, emptyCall) {
		try {
			const argv = [
				'playerctl',
				...this._playerctlArgs,
				'--follow',
				...argsArray
			];

			if (this._playerctlProcesses[id]) {
				this._stopPlayerctl(id);
			}

			const proc = Gio.Subprocess.new(
				argv,
				Gio.SubprocessFlags.STDOUT_PIPE |
				Gio.SubprocessFlags.STDERR_PIPE
			);

			const stdout = new Gio.DataInputStream({
				base_stream: proc.get_stdout_pipe()
			});

			this._playerctlProcesses[id] = {
				proc,
				stdout,
				stopped: false
			};

			let out = "";
			const readNext = () => {
				if (!this._playerctlProcesses[id] ||
					this._playerctlProcesses[id].stopped)
					return;

				stdout.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
					try {
						const follow = this._playerctlProcesses[id];
						if (!follow || follow.stopped)
							return;

						const [line] = stream.read_line_finish_utf8(res);

						if (line === null)
							return;

						if (multiLine) {
							if (line === this.PLAYERCTL_END) {
								callback(out);
								out = "";
							} else if (emptyCall && line === '') {
								callback(out);
								out = "";
							} else if (out === '') out += line;
							else out += `\n${line}`;

						} else callback(line);
						readNext();
					} catch (e) {
						global.logError(`[${this.metadata.uuid}] _startPlayerctl.read exception: ${e}`);
					}
				});
			};

			readNext();
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _startPlayerctl exception: ${e}`);
		}
	},

	_stopPlayerctl: function (id) {
		const follow = this._playerctlProcesses[id];
		if (!follow)
			return;

		follow.stopped = true;

		try {
			follow.proc.force_exit();
		} catch (e) {}

		delete this._playerctlProcesses[id];
	},

	_reload: function () {
		try {
			this.checkbox.setToggleState(this.disabled);
			this.overridesCheckbox.setToggleState(this.overridesEnabled);
			if (this._checkPlayerctlInstalled() && !this.disabled) {
				this._metadataTags = [
					...this.artEnabled ? ['mpris:artUrl'] : [],
					...this.overridesEnabled ? ['xesam:title','xesam:artist'] : [],
					...this.overridesEnabled && this.mixDetection ? ['xesam:comment'] : [],
					...this.textEnabled || (this.overridesEnabled && this.mixDetection) ? ['position / 1000000'] : [],
					...this.textEnabled ? ['mpris:length / 1000000'] : []
				];

				this._currentPlayer = null;
				this._lastArtUrl = null;
				this._lastMixTitle = null;
				this._lastTimeText = null;
				this._metadata = {};

				this._updateLayout();
				this._updateFont();
				this._updateStatus();

				this._getPlayerctlArgs();
				this._startPlayerctl('player', ['status', '--format', '{{ playerName }}'],
				player => {
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] player changed: ${player ?? "none"}`);
					}

					this._currentPlayer = player;

					if (this._currentPlayer) {
						this._startPlayerctl('main', [`--player=${this._currentPlayer}`,
							'metadata', '--format', [
									this._metadataTags.map(tag => '{{' + tag + '}}').join(this.PLAYERCTL_SPLIT),
									`\n${this.PLAYERCTL_END}`
								].join('')
							],
							tags => {
								if (tags) { 
									this._updateMetadata(tags.split(this.PLAYERCTL_SPLIT));
								} else {
									this._updateMetadata(this._metadataTags.map(() => null));
								}
							},
							true, true
						);
					} else {
						this._stopPlayerctl('main');

						this._lastArtUrl = null;
						this._lastMixTitle = null;
						this._lastTimeText = null;
						this._metadata = {};

						this._updateLayout();
						this._updateFont();
						this._updateStatus();
					}
				});
			} else {
				for (const process of Object.keys(this._playerctlProcesses)) {
					this._stopPlayerctl(process);
				}

				this._currentPlayer = null;
				this._lastArtUrl = null;
				this._lastMixTitle = null;
				this._lastTimeText = null;
				this._metadata = {};

				this._updateLayout();
				this._updateFont();
				this._updateStatus();
			}
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _reload exception: ${e}`);
		}
	},

	_updateMetadata: function (tags) {
		try {
			for (let i = tags.length - 1; i >= 0; i--) {
				this._metadata[this._metadataTags[i]] = tags[i];
			}
			this._updateStatus();
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _updateMetadata exception: ${e}`);
		}
	},

	_updateStatus: function () {
		if (this.artEnabled) {
			if (this.mixDetection) {
				const mixTitle = this._grabMixTitleOverride(this._metadata['xesam:comment'], this._metadata['position / 1000000'])
				if (mixTitle && mixTitle != this._lastMixTitle) {
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] art update triggered because the track is a mix`);
					}
					this._lastMixTitle = mixTitle;
					this._updateArt(mixTitle);
				}
				if (!mixTitle) this._updateArt()
			} else this._updateArt();
		} else if (this._lastArtUrl !== null || !this._currentPlayer) {
			this._updateArt();
		}
		if (!this.disabled && this.textEnabled) {
			this._updateTime();
		} else if (this._lastTimeText !== null || !this._currentPlayer) {
			this._updateTime();
		}
	},

	_updateArt: function (mixTitle = null) {
		let artUrl = this._metadata['mpris:artUrl'];
		// If overrides are enabled, try to find a local override image
		if (this.overridesEnabled && this.overridesDirectory) {
			let safeArtist = (this._metadata['xesam:artist'] || 'unknown').replace(/[/\\?%*:|"<>]/g, '_');
			let safeTitle = (mixTitle ? mixTitle : (this._metadata['xesam:title'] || 'unknown')).replace(/[/\\?%*:|"<>]/g, '_');
			const exts = ['png','jpg','jpeg','webp'];
			for (let ext of exts) {
				let candidate = GLib.build_filenamev([this.overridesDirectory, `${safeArtist} - ${safeTitle}.${ext}`]);
				if (GLib.file_test(candidate.replace("file://",""), GLib.FileTest.EXISTS)) {
					artUrl = candidate;
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] grabbed override art path ${artUrl}`);
					}
					break;
				}
			}
			if (artUrl === this._metadata['mpris:artUrl'] && mixTitle !== null) {
				this._updateArt();
				return;
			}
			this._setArt(artUrl);
		} else this._setArt(artUrl);
	},

	_updateTime: function () {
		try {
			if (this.disabled || !this.textEnabled || !this._metadata['position / 1000000'] || !this._metadata['mpris:length / 1000000']) {
				this._setTimeText("");
			} else {
				const time = this._metadata['position / 1000000'];
				const length = this._metadata['mpris:length / 1000000'];
				const timeSeconds = Math.floor(time);
				const timeMinutes = Math.floor(time / 60);
				const timeHours = Math.floor(time / 3600);
				const lengthSeconds = Math.floor(length);
				const lengthMinutes = Math.floor(length / 60);
				const lengthHours = Math.floor(length / 3600);
				// GOOD LORD THIS IS SO UNREADABLE
				// %time%
				let timeText = this.timeFormat.replace(`%time%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString() + ":") : "0:"}${timeSeconds > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : "00"}/${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : "0:"}${lengthSeconds > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%time|0:00%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString() + ":") : "0:"}${timeSeconds > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : "00"}/${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : "0:"}${lengthSeconds > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%time|00:00%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : "00:"}${timeSeconds > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : "00"}/${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : "00:"}${lengthSeconds > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%time|00%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString() + ":") : ""}${timeSeconds > 0 ? (timeMinutes > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : (timeSeconds % 60).toString()) : "0"}/${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : ""}${lengthSeconds > 0 ? (lengthMinutes > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : (lengthSeconds % 60).toString()) : "0"}`);
				timeText = timeText.replaceAll(`%time|0%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeMinutes % 60).toString() + ":" : ""}${timeSeconds > 0 ? (timeSeconds % 60).toString() : "0"}/${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthMinutes % 60).toString() + ":" : ""}${lengthSeconds > 0 ? (lengthSeconds % 60).toString() : "0"}`);
				timeText = timeText.replaceAll(`%time|0:0%`,`${lengthHours > 0 ? timeHours.toString().padStart(lengthHours.toString().length,"0") + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString().padStart((lengthMinutes % 60).toString().length,"0") + ":") : ""}${lengthSeconds > 0 ? (lengthMinutes > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : (timeSeconds % 60).toString().padStart((lengthSeconds % 60).toString().length,"0")) : "0"}/${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : ""}${lengthSeconds > 0 ? (lengthMinutes > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : (lengthSeconds % 60).toString()) : "0"}`);
				// %position%
				timeText = timeText.replaceAll(`%position%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString() + ":") : "0:"}${timeSeconds > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%position|0:00%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString() + ":") : "0:"}${timeSeconds > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%position|00:00%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : "00:"}${timeSeconds > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%position|00%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString() + ":") : ""}${timeSeconds > 0 ? (timeMinutes > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : (timeSeconds % 60).toString()) : "0"}`);
				timeText = timeText.replaceAll(`%position|0%`,`${timeHours > 0 ? timeHours.toString() + ":" : ""}${timeMinutes > 0 ? (timeMinutes % 60).toString() + ":" : ""}${timeSeconds > 0 ? (timeSeconds % 60).toString() : "0"}`);
				timeText = timeText.replaceAll(`%position|0:0%`,`${lengthHours > 0 ? timeHours.toString().padStart(lengthHours.toString().length,"0") + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (timeMinutes % 60).toString().padStart(2, "0") + ":" : (timeMinutes % 60).toString().padStart((lengthMinutes % 60).toString().length,"0") + ":") : ""}${lengthSeconds > 0 ? (lengthMinutes > 0 ? (timeSeconds % 60).toString().padStart(2,"0") : (timeSeconds % 60).toString().padStart((lengthSeconds % 60).toString().length,"0")) : "0"}`);
				// %length%
				timeText = timeText.replaceAll(`%length%`,`${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : "0:"}${lengthSeconds > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%length|0:00%`,`${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : "0:"}${lengthSeconds > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%length|00:00%`,`${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : "00:"}${lengthSeconds > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : "00"}`);
				timeText = timeText.replaceAll(`%length|00%`,`${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : ""}${lengthSeconds > 0 ? (lengthMinutes > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : (lengthSeconds % 60).toString()) : "0"}`);
				timeText = timeText.replaceAll(`%length|0%`,`${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthMinutes % 60).toString() + ":" : ""}${lengthSeconds > 0 ? (lengthSeconds % 60).toString() : "0"}`);
				timeText = timeText.replaceAll(`%length|0:0%`,`${lengthHours > 0 ? lengthHours.toString() + ":" : ""}${lengthMinutes > 0 ? (lengthHours > 0 ? (lengthMinutes % 60).toString().padStart(2, "0") + ":" : (lengthMinutes % 60).toString() + ":") : ""}${lengthSeconds > 0 ? (lengthMinutes > 0 ? (lengthSeconds % 60).toString().padStart(2,"0") : (lengthSeconds % 60).toString()) : "0"}`);

				this._setTimeText(timeText);
			}
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _updateTime exception: ${e}`);
		}
	},

	_setTimeText: function(text) {
		try {
			if (!text?.trim()) {
				this.timeLabel.hide();
				this.outlineContainer.hide();
				return;
			} else if (!this.timeLabel.visible && !this.disabled) {
				this.timeLabel.show();
			}
			if (text != this._lastTimeText) {
				if (this.debugMode) {
					global.log(`[${this.metadata.uuid}] setting time text to ${text}`);
				}
				this.timeLabel.set_text(text);
				for (let i = 0; i < 4; i++) {
					this.outlineLabels[i].set_text(text);
				}
				this._lastTimeText = text;
			}
			this.outlineContainer.visible = (this.outlineEnabled && this.timeLabel.visible && !(this.timeLabel.get_text().trim() === ""));
			this._positionLabel();
		} catch (e) {global.logError(`[${this.metadata.uuid}] _setTimeText exception: ${e}`);}
	},

	_positionLabel: function () {
		// run on idle so label size is known
		let timeout = this._posTimeout = GLib.timeout_add(
			GLib.PRIORITY_DEFAULT_IDLE,
			0,
			Lang.bind(this, function () {
				if (timeout) {
					GLib.source_remove(timeout);
					timeout = null;
				}

				let position = this.position;
				let xOffset = this.xOffset;
				let yOffset = this.yOffset;
				if (this.artEnabled && !this.art.visible || this._failArt) {
					position = this.noArtPosition;
					xOffset = this.noArtXOffset;
					yOffset = this.noArtYOffset;
				}

				const labelW = this.timeLabel.get_width();
				const labelH = this.timeLabel.get_height();
				let dsW = this.xSize;
				let dsH = this.ySize;
				if (this.textInArt && this.art.visible) {
					dsW = this.margin.width;
					dsH = this.margin.height;
					xOffset += this.margin.position.x
					yOffset += this.margin.position.y
				}
				const m = this.marginSize;

				let anchorX = 0, anchorY = 0;
				switch (position) {
					case "top_left":	 anchorX = m + xOffset;	anchorY = m + yOffset; break;
					case "top_right":	 anchorX = dsW - m - labelW + xOffset; anchorY = m + yOffset; break;
					case "bottom_left":  anchorX = m + xOffset;	anchorY = dsH - m - labelH + yOffset; break;
					case "bottom_right": anchorX = dsW - m - labelW + xOffset; anchorY = dsH - m - labelH + yOffset; break;
					case "center":		 anchorX = (dsW / 2) - Math.round(labelW / 2) + xOffset; anchorY = (dsH / 2) - Math.round(labelH / 2) + yOffset; break;
					default:			 anchorX = dsW - m - labelW + xOffset; anchorY = m + yOffset; break;
				}

				anchorX = Math.round(anchorX);
				anchorY = Math.round(anchorY);
				this.timeLabel.set_position(anchorX, anchorY);
				if (this.outlineEnabled) {
					this.outlineLabels[0].set_position(Math.round(anchorX + this.outlineSize), anchorY);
					this.outlineLabels[1].set_position(Math.round(anchorX - this.outlineSize), anchorY);
					this.outlineLabels[2].set_position(anchorX, Math.round(anchorY - this.outlineSize));
					this.outlineLabels[3].set_position(anchorX, Math.round(anchorY + this.outlineSize));
				}
				return false;
			})
		);
	},

	_updateLayout: function () {
		// set container size
		this.container.width = this.xSize;
		this.container.height = this.ySize;
		const aspectRatio = this._imageSize.width / this._imageSize.height;
		const containerRatio = this.xSize / this.ySize

		if (this.artEnabled && !this.disabled && !this._failArt && this._lastArtUrl !== null) {
			if (aspectRatio === containerRatio) {
				this._artSize = {width: this.xSize - (this.marginSize * 2), height: this.ySize - (this.marginSize * 2)};

				this.margin.set_size(this.xSize, this.ySize)
				this.art.set_size(this._artSize.width, this._artSize.height);
				this.backdrop.set_size(this._artSize.width, this._artSize.height)

				this.margin.set_position(0,0)
				this.art.set_position(this.marginSize, this.marginSize);
				this.backdrop.set_position(this.marginSize, this.marginSize);
			} else {
				let scale = Math.min((this.xSize - (this.marginSize * 2)) / this._imageSize.width,(this.ySize - (this.marginSize * 2)) / this._imageSize.height);
				this._artSize = {width: this._imageSize.width * scale, height: this._imageSize.height * scale};

				const W = this._artSize.width;
				const H = this._artSize.height;
				const dsW = this.container.width;
				const dsH = this.container.height;
				const m = this.marginSize;

				let anchorX = 0, anchorY = 0;
				switch (this.artPosition) {
					case "top_left":	 anchorX = m;	anchorY = m; break;
					case "top_right":	 anchorX = dsW - m - W; anchorY = m; break;
					case "bottom_left":  anchorX = m;	anchorY = dsH - m - H; break;
					case "bottom_right": anchorX = dsW - m - W; anchorY = dsH - m - H; break;
					case "center":		 anchorX = (dsW / 2) - Math.round(W / 2); anchorY = (dsH / 2) - Math.round(H / 2); break;
					default:			 anchorX = dsW - m - W; anchorY = m; break;
				}

				this.margin.set_size(this._artSize.width + (this.marginSize * 2), this._artSize.height + (this.marginSize * 2))
				this.art.set_size(this._artSize.width, this._artSize.height);
				this.backdrop.set_size(this._artSize.width, this._artSize.height)

				this.margin.set_position(anchorX - this.marginSize, anchorY - this.marginSize)
				this.art.set_position(anchorX, anchorY);
				this.backdrop.set_position(anchorX, anchorY);
			}
			this.art.show();
			this.backdrop.style = `background-color: ${this.backgroundColor};`;
			if (this.marginSize > 0) this.margin.style = `background-color: ${this.marginColor};`;
			else this.margin.style = ``;
		} else {
			this.art.hide();
			this.margin.style = "";
			this.backdrop.style = "";
		}

		this._positionLabel();
	},

	_updateFont: function () {
		// parse the font string from the settings
		const desc = Pango.font_description_from_string(this.font);

		// get family
		const family = desc.get_family();
		// get size in points
		const size = desc.get_size() / Pango.SCALE; // Pango stores size*Pango.SCALE
		// get weight and style
		const weight = desc.get_weight(); // e.g. 400, 700 etc.
		const style = desc.get_style();	// 0 = normal, 1 = oblique, 2 = italic

		// turn weight/style into CSS-friendly strings
		const weightStr = (weight >= Pango.Weight.BOLD) ? 'bold' : 'normal';
		const styleStr = (style === Pango.Style.ITALIC) ? 'italic'
						: (style === Pango.Style.OBLIQUE) ? 'oblique' : 'normal';

		// now build a style string for St.Label
		this.timeLabel.style =
			'font-family: ' + family + '; ' +
			'font-weight: ' + weightStr + '; ' +
			'font-style: ' + styleStr + '; ' +
			'font-size: ' + size + 'pt; ' +
			'color: ' + this.color + ';';

		for (let i = 0; i < 4; i++) {
			this.outlineLabels[i].style =
				'font-family: ' + family + '; ' +
				'font-weight: ' + weightStr + '; ' +
				'font-style: ' + styleStr + '; ' +
				'font-size: ' + size + 'pt; ' +
				'color: ' + this.outlineColor + ';';
		}
		this._positionLabel();
	},

	_grabMixTitleOverride: function (text, time) {
		try {
			if (!text) return null;
			if (typeof time !== "number") return null;

			// Parse timestamped lines
			const lines = text.split(/\r?\n/);
			const entries = [];

			for (const line of lines) {
				const match = line.match(/\[(.*?)\]:\s*(.*)/);
				if (match) {
					const [, timestamp, title] = match;
					let secs = null;

					if (typeof timestamp === "number") secs = timestamp;
					const parts = String(timestamp)
						.trim()
						.split(":")
						.filter(Boolean)
						.map(p => Number(p.trim()));

					if (parts.some(isNaN)) secs = NaN;
					let seconds = 0;
					let multiplier = 1;
					for (let i = parts.length - 1; i >= 0; i--) {
						seconds += parts[i] * multiplier;
						multiplier *= 60;
						}
					secs = seconds;
					if (!isNaN(secs)) {
						entries.push({ time: secs, title: title.trim() });
					}
				}
			}

			// Sort by time just in case
			entries.sort((a, b) => a.time - b.time);

			// Find the latest title at or before given time
			let currentTitle = null;
			for (const entry of entries) {
				if (time >= entry.time) currentTitle = entry.title;
				else break;
			}

			return currentTitle;
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _grabMixTitleOverride exception: ${e}`);
		}
	},

	_setArt: function (artUrl = null) {
		try {
			if (artUrl && artUrl !== this._lastArtUrl) {
				this._lastArtUrl = artUrl;
				if (artUrl.startsWith("https://") || artUrl.startsWith("http://")) {
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] parsing art from url: ${artUrl}`);
					}
					this._loadArtFromUrl(artUrl);
				} else {
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] parsing art from file: ${artUrl}`);
					}
					this._loadArtFromFile(artUrl);
				}
			} else if (typeof artUrl !== "string" && this._lastArtUrl !== null) {
				this._lastArtUrl = null;
				this._updateLayout();
			}
		} catch (e) {global.logError(`[${this.metadata.uuid}] _setArt exception: ${e}`);}
	},

	_loadArtFromFile: function (artPath) {
		let timeout = this._artTimeout = GLib.timeout_add(
			GLib.PRIORITY_DEFAULT_IDLE,
			0,
			Lang.bind(this, function () {
				if (timeout) {
					GLib.source_remove(timeout);
					timeout = null;
				}

				try {
					// Normalize path
					let localPath = artPath.replace("file://", "");
					if (!GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
						global.logWarning(`[${this.metadata.uuid}] File does not exist: ${localPath}`);
					}

					const MAX_SIZE = 4096;
					let maxW = this.xSize - (this.marginSize * 2);
					let maxH = this.ySize - (this.marginSize * 2);
					maxW = Math.min(maxW, MAX_SIZE);
					maxH = Math.min(maxH, MAX_SIZE);

					// Normalize Image To RGBA
					let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
						localPath,
						maxW,
						maxH,
						true
					);
					if (!pixbuf.get_has_alpha()) {
						pixbuf = pixbuf.add_alpha(false, 0, 0, 0);
					}

					// Get Image Size
					this._imageSize = {width: pixbuf.get_width(), height: pixbuf.get_height()};
					this._updateLayout();

					// Load Image
					let image = new Clutter.Image();
					image.set_data(
						pixbuf.get_pixels(),
						Cogl.PixelFormat.RGBA_8888,
						this._imageSize.width,
						this._imageSize.height,
						pixbuf.get_rowstride()
					);

					this.art.set_content(image);

					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] loaded art from file: ${localPath}`);
					}
				} catch (e) {
					this._lastArtUrl = null;
					this._updateLayout();
					global.logWarning(`[${this.metadata.uuid}] Could not load art from file: ${artPath}, Error: ${e}`);
				}
			})
		);
	},

	_loadArtFromUrl: function (artUrl) {
		try {
			// Grab url hash
			const hash = GLib.compute_checksum_for_string(
				GLib.ChecksumType.SHA256,
				artUrl,
				-1
			).substring(0,24);

			// Build file path
			const cacheDir = GLib.build_filenamev([
				GLib.get_user_cache_dir(),
				"music-display"
			]);
			GLib.mkdir_with_parents(cacheDir, 0o755);
			const cachePath = GLib.build_filenamev([
				cacheDir,
				`art_${hash}.png`
			]);

			const maxAge = 60 * 60 * 3; // 3 hours

			if (GLib.file_test(cachePath, GLib.FileTest.EXISTS)) {
				const file = Gio.File.new_for_path(cachePath);

				const info = file.query_info(
					'time::modified',
					Gio.FileQueryInfoFlags.NONE,
					null
				);

				const mtime = info.get_attribute_uint64('time::modified');
				const now = Math.floor(Date.now() / 1000);

				if ((now - mtime) < maxAge) {
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] art url: ${artUrl} is already cached at: ${cachePath} skipping download`);
					}
					this._loadArtFromFile(cachePath);
					return;
				} else {
					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] art url: ${artUrl} is already cached at: ${cachePath} but is older than the max age`);
					}
				}
			}

			// Build GET message
			let message = Soup.Message.new('GET', artUrl);

			// Send asynchronously
			this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
				try {
					// Get bytes from response
					const bytes = this._soupSession.send_and_read_finish(res);
					// Check status code
					if (message.get_status() !== Soup.Status.OK) {
						global.logWarning(`[${this.metadata.uuid}] Failed to download image: ${artUrl} status ${message.get_status()}`);
					}

					// Save to cache
					GLib.file_set_contents(cachePath, bytes.get_data());

					if (this.debugMode) {
						global.log(`[${this.metadata.uuid}] grabbed art from url: ${artUrl} to: ${cachePath}`);
					}

					// Load it as local file
					this._loadArtFromFile(cachePath);
				} catch (e) {
					this._lastArtUrl = null;
					this._updateLayout();
					global.logWarning(`[${this.metadata.uuid}] Could not load art from URL: ${artUrl}, Error: ${e}`);
				}
			});
		} catch (e) {
			this._lastArtUrl = null;
					this._updateLayout();
			global.logWarning(`[${this.metadata.uuid}] Could not load art from URL: ${artUrl}, Error: ${e}`);
		}
	},

	on_checkbox_toggled: function (checkbox, value) {
		this.disabled = value;
		this._reload();
	},

	on_overridesCheckbox_toggled: function (checkbox, value) {
		this.overridesEnabled = value;
		this._reload();
	},

	on_failCheckbox_toggled: function (checkbox, value) {
		this._failArt = value;
		this._reload();
	},

	on_desklet_removed: function () {
		for (const process of Object.keys(this._playerctlProcesses)) {
			this._stopPlayerctl(process);
		}
		delete this._soupSession;
		this.settings.finalize();
	}
};

function main(metadata, instance_id) {
	return new MusicDisplayAdditionsDesklet(metadata, instance_id);
}