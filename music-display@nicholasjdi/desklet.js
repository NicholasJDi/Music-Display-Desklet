const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;
const Pango = imports.gi.Pango;

function MusicDisplayDesklet(metadata, instance_id) {
	this._init(metadata, instance_id);
}

MusicDisplayDesklet.prototype = {
	__proto__: Desklet.Desklet.prototype,

	_init: function (metadata, instance_id) {
		Desklet.Desklet.prototype._init.call(this, metadata, instance_id);
		this.metadata = metadata;
		const basePath = this.metadata.path + "/textures/";

		// Defaults
		this.line1Format = "%title%";
		this.line2Format = "%artist%";
		this.line1Font = "ubuntu 20";
		this.line2Font = "ubuntu 12";
		this.line1Color = "white";
		this.line2Color = "white";

		this.line1NoPlayer = "No player running";
		this.line2NoPlayer = "";
		this.line1Stopped = "Player %player% is stopped";
		this.line2Stopped = "";

		this.mixDetection = false;
		this.emptyValues = "Unknown,None,N/A,0"

		this.hideSkipButtons = false;
		this.hideAllButtons = false;
		this.buttonTextSpacing = 7;
		this.buttonSize = 32;

		this.playerWhitelist = "rhythmbox,spotify";
		this.treatWhitelistAsBlacklist = false;

		this.debugMode = false;

		this.btnPlayTexture = basePath + "play.png";
		this.btnPauseTexture = basePath + "pause.png";
		this.btnNextTexture = basePath + "next.png";
		this.btnPrevTexture = basePath + "previous.png";

		this.openPlayerMenuItemName = "Open Rhythmbox"
		this.openPlayerMenuItemCommand = "rhythmbox"
		this.openPlayerMenuItemVisible = true
		this.playPauseMenuItemVisible = true
		this.nextPreviousMenuItemsVisible = true
		this.stopPlayerMenuItemVisible = true

		// Constants
		this.TAG_REGEX = /^(?:(lc|uc|duration|markup_escape|default|emoji|trunc|)\((.+)\)|([A-Za-z0-9]+:[A-Za-z0-9_]+|position|volume|status|loop|shuffle|playerName))$/i;
		this.PLAYERCTL_END = '⹳Ḓ聉飪狮୳欖叁⚟ᦎ멭஺莎혠濨';
		this.PLAYERCTL_SPLIT = 'ꡉ弄⛟퐂�掙᭻淛ᛈ䔻뇉况륚賈';

		// Cache
		this._playerctlProcesses = {};
		this._playerctlArgs = [];
		this._currentPlayer = null;
		this._line1Format = null;
		this._line2Format = null;
		this._status = undefined;
		this._mixTitle = null;
		this._metadata = {};
		this._metadataTags = [];
		this._emptyValues = null;

		// Soft Cache
		this._prevNextDone = null;
		this._lastPlayPauseFile = null;
		this._lastButtonSize = null;
		this._lastLine1Text = null;
		this._lastLine2Text = null;
		this._lastPlayer = null;

		// Settings
		this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, instance_id);
		this._bindSettings()

		// Layout
		this.mainBox = new St.BoxLayout({ vertical: false });
		this.setContent(this.mainBox);

		// Buttons column
		this.buttonVBox = new St.BoxLayout({ vertical: true });
		this.mainBox.add_child(this.buttonVBox);

		this.btnPlayPause = new St.Button();
		this.btnPlayPause.connect('button-press-event', Lang.bind(this, this._onPlayPausePressed));
		this.buttonVBox.add_child(this.btnPlayPause);

		this.skipHBox = new St.BoxLayout({ vertical: false });
		this.buttonVBox.add_child(this.skipHBox);

		this.btnPrev = new St.Button();
		this.btnPrev.connect('button-press-event', Lang.bind(this, this._onPrevPressed));
		this.skipHBox.add_child(this.btnPrev);

		this.btnNext = new St.Button();
		this.btnNext.connect('button-press-event', Lang.bind(this, this._onNextPressed));
		this.skipHBox.add_child(this.btnNext);

		// Spacing widget between buttons and text
		this.spacingWidget = new St.Widget({ style_class: "spacing-widget", reactive: false });
		this.mainBox.add_child(this.spacingWidget);

		// Text column
		this.textVBox = new St.BoxLayout({ vertical: true});
		this.mainBox.add_child(this.textVBox);

		this.labelTitle = new St.Label({ text: "" });
		this.textVBox.add_child(this.labelTitle);

		this.labelArtist = new St.Label({ text: "" });
		this.textVBox.add_child(this.labelArtist);

		this._buildContextMenu();

		// Initial run
		this._updateFont();
		this.labelTitle.set_text("Loading...");
		this.labelArtist.set_text("");
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

		// Line 1 settings
		settings.bind("line1_format", "line1Format", bind(this, this._parseFormat));
		settings.bind("line1_font", "line1Font", bind(this, this._updateFont));
		settings.bind("line1_color", "line1Color", bind(this, this._updateFont));
		settings.bind("line1_no_player", "line1NoPlayer", bind(this, this._updateText));
		settings.bind("line1_stopped", "line1Stopped", bind(this, this._updateText));

		// Line 2 settings
		settings.bind("line2_format", "line2Format", bind(this, this._parseFormat));
		settings.bind("line2_font", "line2Font", bind(this, this._updateFont));
		settings.bind("line2_color", "line2Color", bind(this,this._updateFont));
		settings.bind("line2_no_player", "line2NoPlayer", bind(this, this._updateText));
		settings.bind("line2_stopped", "line2Stopped", bind(this, this._updateText));

		// Button settings
		settings.bind("btn_play_texture", "btnPlayTexture", () => {
			this._lastPlayPauseFile = null;
			this._updateButtons();
		});
		settings.bind("btn_pause_texture", "btnPauseTexture", () => {
			this._lastPlayPauseFile = null;
			this._updateButtons();
		});
		settings.bind("btn_next_texture", "btnNextTexture", () => {
			this._prevNextDone = null;
			this._updateButtons();
		});
		settings.bind("btn_prev_texture", "btnPrevTexture", () => {
			this._prevNextDone = null;
			this._updateButtons();
		});
		settings.bind("hide_skip_buttons", "hideSkipButtons", bind(this, this._updateButtons));
		settings.bind("hide_all_buttons", "hideAllButtons", bind(this, this._updateButtons));
		settings.bind("button_text_spacing", "buttonTextSpacing", bind(this, this._updateButtons));
		settings.bind("button_size", "buttonSize", bind(this, this._updateButtons));

		// Context Menu Settings
		settings.bind("open_player_name", "openPlayerMenuItemName", bind(this, this._buildContextMenu));
		settings.bind("open_player_command", "openPlayerMenuItemCommand", bind(this, this._buildContextMenu));
		settings.bind("open_player_visible", "openPlayerMenuItemVisible", bind(this, this._buildContextMenu));
		settings.bind("play/pause_visible", "playPauseMenuItemVisible", bind(this, this._buildContextMenu));
		settings.bind("next/previous_visible", "nextPreviousMenuItemsVisible", bind(this, this._buildContextMenu));
		settings.bind("stop_player_visible", "stopPlayerMenuItemVisible", bind(this, this._buildContextMenu));

		// Tag settings
		settings.bind("mix_detection", "mixDetection", bind(this, this._parseFormat));
		settings.bind("empty_values", "emptyValues", bind(this, this._updateText));

		// Player settings
		settings.bind("player_whitelist", "playerWhitelist", bind(this, this._reload));
		settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", bind(this, this._reload));

		settings.bind("debug_mode", "debugMode", null);
	},

	_buildContextMenu: function () {
		if (this.openPlayerMenuItem == null) {
			// Build Context Menu
			// Context Menu Open Player
			this.openPlayerMenuItem = new PopupMenu.PopupMenuItem(this.openPlayerMenuItemName);
			this._menu.addMenuItem(this.openPlayerMenuItem)
			this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
			// Context Menu Play/Pause Track
			this.playPauseMenuItem = this._menu.addAction(_('Play/Pause Track'), Lang.bind(this, function () {
				GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} play-pause`);
			}));
			// Context Menu Next Track
			this.nextMenuItem = this._menu.addAction(_('Next Track'), Lang.bind(this, function () {
				GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} next`);
			}));
			// Context Menu Previous Track
			this.previousMenuItem = this._menu.addAction(_('Previous Track'), Lang.bind(this, function () {
				GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} previous`);
			}));
			// Context Menu Stop Player
			this.stopPlayerMenuItem = this._menu.addAction(_('Stop Player'), Lang.bind(this, function () {
				GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} stop`);
			}));
			this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
			// Context Menu Reload Desklet
			this.reloadMenuItem = this._menu.addAction(_('Reload'), Lang.bind(this, function () {
				this._reload();
			}));
		}
		// update open player menu item content
		if (this.openPlayerMenuItem) {
			// update label
			this.openPlayerMenuItem.label.set_text(this.openPlayerMenuItemName);

			// create command handler
			if (this.openPlayerMenuItemSignal) {
				this.openPlayerMenuItem.disconnect(this.openPlayerMenuItemSignal);
			}

			this.openPlayerMenuItemSignal = this.openPlayerMenuItem.connect(
				'activate',
				Lang.bind(this, function () {
					GLib.spawn_command_line_async(this.openPlayerMenuItemCommand);
				})
			);
		}
		// update visibility
		this.openPlayerMenuItem.actor.visible = this.openPlayerMenuItemVisible;
		this.playPauseMenuItem.actor.visible = this.playPauseMenuItemVisible;
		this.nextMenuItem.actor.visible = this.nextPreviousMenuItemsVisible;
		this.previousMenuItem.actor.visible = this.nextPreviousMenuItemsVisible;
		this.stopPlayerMenuItem.actor.visible = this.stopPlayerMenuItemVisible;
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
			if (!this._checkPlayerctlInstalled()) {
				for (const process of Object.keys(this._playerctlProcesses)) {
					this._stopPlayerctl(process);
				}
				this.buttonVBox.hide();
				this.spacingWidget.hide();
				this.labelTitle.set_text("playerctl is not installed");
				this.labelArtist.set_text("Use command: sudo apt install playerctl\nRight click this desklet and press 'Reload'");
				return;
			} else {
				this._lastLine1Text = null;
				this._lastLine2Text = null;
				this._lastPlayPauseFile = null;
				this._lastButtonSize = null;
				this._lastPlayer = null;

				this._updateFont();
				this.labelTitle.set_text("Loading...");
				this.labelArtist.set_text("");

				this._getPlayerctlArgs();
				this._startPlayerctl('status', ['status', '--format',
					'{{ status }}||||{{ playerName }}'],
				thing => {
					const things = thing.split('||||',2);
					this._updateStatus(things[0], things[1]);
				});
			}
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _reload exception: ${e}`);
		}
	},

	_updateStatus: function (status, player) {
		try {
			if (status === "Stopped") this._status = null;
			else if (!status) this._status = undefined;
			else this._status = status === "Playing";
			if (this.debugMode) {
				global.log(`[${this.metadata.uuid}] _updateStatus: ${this._status}${status ? " (" + status + ")" : ''} [${player}]`);
			}
			this._updateButtons();

			this._currentPlayer = player;
			if (this._currentPlayer !== this._lastPlayer) {
				this._lastPlayer = this._currentPlayer;
				this._parseFormat();
			}

			if (this._status === null || this._status === undefined) this._updateText();
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _updateStatus exception: ${e}`);
		}
	},

	_updateText: function () {
		this._emptyValues = (this.emptyValues || "").split(",").map(s => s.trim()).filter(Boolean);
		let line1Text;
		let line2Text;
		if (this._status === undefined) {
			line1Text = this.line1NoPlayer;
			line2Text = this.line2NoPlayer;
		} else if (this._status === null) {
			line1Text = this.line1Stopped.replaceAll('%player%', this._currentPlayer);
			line2Text = this.line2Stopped.replaceAll('%player%', this._currentPlayer);
		} else {
			if (this.mixDetection && this._metadata['xesam:comment'] !== undefined && this._metadata['position'] !== undefined)
				this._mixTitle = this._getMixTitle(this._metadata['xesam:comment'],this._metadata['position'] / 1000000);
			else this._mixTitle = null;
			line1Text = this._buildTag(this._line1Format);
			line2Text = this._buildTag(this._line2Format);
		}

		if (line1Text !== this._lastLine1Text) {
			this._lastLine1Text = line1Text;
			this.labelTitle.set_text(line1Text);
		}
		if (line2Text !== this._lastLine2Text) {
			this._lastLine2Text = line2Text;
			this.labelArtist.set_text(line2Text);
		}
		if (this.debugMode) {
			global.log(`[${this.metadata.uuid}] _updateText: {${line1Text}} || {${line2Text}}`);
		}
	},

	_buildTag: function (node) {
		try {
			if (Array.isArray(node))
				return node.map(n => this._buildTag(n)).join('');

			if (typeof node === 'string')
				return node;

			if (node.value) {
				if (node.players && (
					node.blacklist ?
					node.players.includes(this._currentPlayer)
					: !node.players.includes(this._currentPlayer)
				)) return "";

				let metadata = this._getMetadata(node.value);
				let match = null;
				if (typeof node.match === 'string') {
					if (node.type === 'number') {
						match = Number(node.match);
						metadata = Number(metadata);
					} else match = node.match;
				}

				if (match  === null ?
					((node.inversed ? !metadata || !(node.forced || !this._emptyValues.includes(metadata.toString())) : metadata && (node.forced || !this._emptyValues.includes(metadata.toString())))) :
					(node.mode === '>' ?  (node.inversed ? !(metadata > match) : (metadata > match)) :
					node.mode === '<' ? (node.inversed ? !(metadata < match) : (metadata < match)) :
					node.mode === '=>' ? (node.inversed ? !(metadata >= match) : (metadata >= match)) :
					node.mode === '=<' ? (node.inversed ? !(metadata <= match) : (metadata <= match)) :
					(node.inversed ? !(metadata === match) : (metadata === match))) &&
					(!node.forced || !this._emptyValues.includes(metadata.toString()))
				) {
					let out = "";

					if (node.prefix)
						out += this._buildTag(node.prefix);

					if (!node.conditional)
						out += metadata;

					if (node.suffix)
						out += this._buildTag(node.suffix);

					return out;
				}
			}
			return "";
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _buildTag exception: ${e}`);
		}
	},

	_getMetadata: function (tag) {
		switch (tag) {
			case "title":
				if (this._mixTitle) return this._mixTitle;
				else return this._metadata['xesam:title'];
			case "mix":
				if (this._mixTitle) return  this._metadata['xesam:title'];
				else return '';
			case "player":
				return this._currentPlayer;
			default:
				return Object.keys(this._metadata).includes(tag) ? this._metadata[tag] : '';
		}
	},

	_parseFormat: function () {
		try {
			this._metadataTags = [];
			this._line1Format = this._parseTags(this.line1Format);
			this._line2Format = this._parseTags(this.line2Format);

			if (this.debugMode) {
				global.log(`[${this.metadata.uuid}] _parseFormat: ${JSON.stringify({
					'line1':this._line1Format,
					'line2':this._line2Format
				},null,'\t')}`);
			}

			this._startPlayerctl('metadata', [`--player=${this._currentPlayer}`,
					'metadata', '--format', [
						this._metadataTags.map(tag => '{{' + tag + '}}').join(this.PLAYERCTL_SPLIT),
						`\n${this.PLAYERCTL_END}`
					].join(''),
				],
				tags => {
					if (tags) {
						this._updateMetadata(tags.split(this.PLAYERCTL_SPLIT));
					} else {
						this._updateMetadata(this._metadataTags.map(() => ""));
					}
				},
				true, true
			);
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _parseFormat exception: ${e}`);
		}
	},

	_parseTags: function (text) {
		const tags = {
			'title': [
				'xesam:title',
				...(this.mixDetection ? ['xesam:comment', 'position'] : [])
			],
			'mix': [
				...(this.mixDetection ? ['xesam:comment', 'position'] : [])
			],
			'player':[]
		};

		let i = 0;

		const parseSequence = () => {
			const out = [];
			let literal = "";
			let isEscaped = false;

			while (i < text.length) {
				//escape
				if (text[i] === "\\") {
					i++;
					isEscaped = true;
				}

				// tag
				if (!isEscaped && text[i] === "%") {
					if (literal.length) {
						out.push(literal);
						literal = "";
					}

					out.push(parseTag());
					continue;
				}

				if (text[i] !== undefined)
					literal += text[i++];
				isEscaped = false;
			}

			if (literal.length)
				out.push(literal);

			return out;
		}

		const parseBalanced = (open, close) => {
			if (text[i] !== open)
				return [];
			i++; // skip open

			const out = [];
			let literal = "";
			let d = 0;
			let isEscaped = false;

			while (i < text.length) {
				//escape
				if (text[i] === "\\") {
					i++;
					isEscaped = true;
				}

				// check for imbalances
				if (!isEscaped && text[i] === open) d++;

				// close at balenced closer
				if (!isEscaped && text[i] === close) {
					if (d-- === 0) {
						break;
					}
				}

				// tag
				if (!isEscaped && text[i] === "%") {
					if (literal.length) {
						out.push(literal);
						literal = "";
					}

					out.push(parseTag());
					continue;
				}

				if (text[i] !== undefined)
					literal += text[i++];
				isEscaped = false;
			}

			if (literal.length)
				out.push(literal);

			if (text[i] !== close)
				return out;
			i++; // skip close

			return out;
		}

		const parseTag = () => {
			if (text[i] !== "%")
				return {};
			const start = i++; // opening %

			const node = {};

			// prefix
			if (text[i] === "{") {
				const prefix = parseBalanced("{", "}");
				if (prefix.length !== 0) node.prefix = prefix;
			}

			// players
			if (text[i] === "!") {
				i++;
				if (text[i] === "[") node.blacklist = true;
				else i--;			}
			if (text[i] === "[") {
				const players = parseBalanced("[", "]").join('');
				if (players.length !== 0) node.players = players.split(",").map(s => s.trim()).filter(Boolean);
			}

			// force
			if (text[i] === "!") {
				node.forced = true;
				i++;
			}

			// conditionals
			if (text[i] === "?") {
				node.conditional = true;
				i++;
				if (text[i] === "?") {
					node.inversed = true;
					i++;
				}
			}

			// value
			let value = "";
			while (
				i < text.length &&
				text[i] !== "{" &&
				text[i] !== "%"
			) {
				value += text[i++];
			}

			if (Object.keys(tags).includes(value.trim()) || this.TAG_REGEX.test(value.trim())) {
				node.value = value.trim();
			} else {
				const tag = 'xesam:' + value.trim();
				if (this.TAG_REGEX.test(tag)) node.value = tag;
				else return text.slice(start,i);
			}

			if (text[i] === "{") {
				// match condition
				if (node.conditional) {
					i++;
					let match = "";

					while (
						i < text.length &&
						text[i] !== "}" &&
						text[i] !== "%"
					) {
						match += text[i++];
					}
					node.match = match;
					if (text[i] === "}") i++;
					if (text[i] === "*") {
						node.type = 'number';
						i++;
					}
					if (text[i] === "=") {
						i++;
						if (text[i] === ">") {
							node.mode = '=>';
							i++;
						}
						if (text[i] === "<") {
							node.mode = '=<';
							i++;
						}
					} else {
						if (text[i] === ">") {
							node.mode = '>';
							i++;
						}
						if (text[i] === "<") {
							node.mode = '<';
							i++;
						}
					}
				} else {
					// suffix
					const suffix = parseBalanced("{", "}");
					if (suffix.length !== 0) node.suffix = suffix;
				}
			}

			if (text[i] !== "%")
				return text.slice(start,i);
			i++; // closing %

			// metadata marking
			if (this.TAG_REGEX.test(node.value)) {
				if (!this._metadataTags.includes(node.value))
					this._metadataTags.push(node.value);
			} else {
				// built in tags
				for (const tag of tags[node.value]) {
					if (!this._metadataTags.includes(tag))
						this._metadataTags.push(tag);
				}
			}

			return node;
		}

		return parseSequence();
	},

	_updateMetadata: function (tags) {
		try {
			for (let i = tags.length - 1; i >= 0; i--) {
				this._metadata[this._metadataTags[i]] = tags[i];
			}
			this._updateText();
		} catch (e) {
			global.logError(`[${this.metadata.uuid}] _updateMetadata exception: ${e}`);
		}
	},

	_getMixTitle: function (text, time) {
		try {
			if (!text || text == "") return null;
			if (!time) return null;

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
			global.logError(`[${this.metadata.uuid}] _getMixTitle exception: ${e}`);
		}
	},

	_updateFont: function() {
		// parse the font string from the settings
		let desc1 = Pango.font_description_from_string(this.line1Font);
		let desc2 = Pango.font_description_from_string(this.line2Font);

		// get family
		let family1 = desc1.get_family();
		let family2 = desc2.get_family();
		// get size
		let size1 = desc1.get_size() / Pango.SCALE;
		let size2 = desc2.get_size() / Pango.SCALE;
		// get weight and style
		let weight1 = desc1.get_weight();
		let style1 = desc1.get_style();
		let weight2 = desc2.get_weight();
		let style2 = desc2.get_style();

		// turn weight/style into strings
		let weightStr1 = (weight1 >= Pango.Weight.BOLD) ? 'bold' : 'normal';
		let styleStr1 = (style1 === Pango.Style.ITALIC) ? 'italic'
			: (style1 === Pango.Style.OBLIQUE) ? 'oblique' : 'normal';
		let weightStr2 = (weight2 >= Pango.Weight.BOLD) ? 'bold' : 'normal';
		let styleStr2 = (style2 === Pango.Style.ITALIC) ? 'italic'
			: (style2 === Pango.Style.OBLIQUE) ? 'oblique' : 'normal';

		// build St.Lable style string
		this.labelTitle.style =
			'font-family: ' + family1 + '; ' +
			'font-weight: ' + weightStr1 + '; ' +
			'font-style: ' + styleStr1 + '; ' +
			'font-size: ' + size1 + 'pt; ' +
			'color: ' + this.line1Color + ';';
		this.labelArtist.style =
			'font-family: ' + family2 + '; ' +
			'font-weight: ' + weightStr2 + '; ' +
			'font-style: ' + styleStr2 + '; ' +
			'font-size: ' + size2 + 'pt; ' +
			'color: ' + this.line2Color + ';';

		if (this.debugMode) {
			global.log(`[${this.metadata.uuid}] _updateFont`);
		}
	},

	_updateButtons: function () {
		if (!this.hideAllButtons && this._status !== null && this._status !== undefined) {
			const basePath = this.metadata.path + "/textures/";
			const playTexture = this.btnPlayTexture || basePath + "play.png";
			const pauseTexture = this.btnPauseTexture || basePath + "pause.png";
			const prevTexture = this.btnPrevTexture || basePath + "previous.png";
			const nextTexture = this.btnNextTexture || basePath + "next.png";

			let playPauseFile = this._status ? pauseTexture : playTexture;
			if (playPauseFile !== this._lastPlayPauseFile) {
				this.btnPlayPause.set_child(new St.Icon({
					gicon: Gio.icon_new_for_string(playPauseFile),
					icon_size: this.buttonSize
				}));
			}

			let skipSize = Math.floor(this.buttonSize / 2);
			if (this._lastButtonSize !== this.buttonSize) {
				this.btnPlayPause.height = this.buttonSize;
				if (!this.hideSkipButtons) {
					this.btnPrev.height = skipSize;
					this.btnNext.height = skipSize;
				}
			}

			if (!this.hideSkipButtons) {
				if (!this._prevNextDone) {
					this.btnPrev.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(prevTexture), icon_size: skipSize }));
					this.btnNext.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(nextTexture), icon_size: skipSize }));
					this._prevNextDone = true;
				}
				this.skipHBox.show();
			} else this.skipHBox.hide();

			this.buttonVBox.show();
			this.spacingWidget.show();
			this.spacingWidget.width = Math.max(0, Math.round(this.buttonTextSpacing));
		} else {
			this.buttonVBox.hide();
			this.spacingWidget.hide();
		}
	},

	_onPlayPausePressed: function (actor, event) {
		if (event.get_button() === 1) {
			GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} play-pause`);
		}
	},

	_onPrevPressed: function (actor, event) {
		if (event.get_button() === 1) {
			GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} previous`);
		}
	},

	_onNextPressed: function (actor, event) {
		if (event.get_button() === 1) {
			GLib.spawn_command_line_async(`playerctl ${this._playerctlArgs.join(' ')} next`);
		}
	},

	on_desklet_removed: function () {
		for (const process of Object.keys(this._playerctlProcesses)) {
			this._stopPlayerctl(process);
		}
		this.settings.finalize();
	}
}

function main(metadata, instance_id) {
	return new MusicDisplayDesklet(metadata, instance_id);
}
