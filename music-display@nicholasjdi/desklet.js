const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

function MusicDisplayDesklet(metadata, instance_id) {
	this._init(metadata, instance_id);
}

MusicDisplayDesklet.prototype = {
	__proto__: Desklet.Desklet.prototype,

	_init: function(metadata, instance_id) {
		Desklet.Desklet.prototype._init.call(this, metadata, instance_id);
		this.metadata = metadata;
		const basePath = this.metadata.path + "/textures/";

		// Defaults
		this.line1Format = "%title%";
		this.line2Format = "%artist%";
		this.line1Font = "";
		this.line2Font = "";
		this.line1Size = 25;
		this.line2Size = 18;

		this.line1_no_player = "No player running";
		this.line2_no_player = "";
		this.line1_stopped = "Player %player% is stopped";
		this.line2_stopped = "";

		this.hideSkipButtons = false;
		this.hideAllButtons = false;
		this.buttonTextSpacing = 7;
		this.buttonSize = 32;

		this.playerWhitelist = "rhythmbox,spotify";
		this.treatWhitelistAsBlacklist = false;
		this.pollInterval = 1;
		this.idlePollInterval = 3;
		this.emptyValues = "Unknown,None,N/A,0"
		this.debugMode = false;

		this.btnPlayTexture = basePath + "play.png";
		this.btnPauseTexture = basePath + "pause.png";
		this.btnNextTexture = basePath + "next.png";
		this.btnPrevTexture = basePath + "previous.png";

		// Track last displayed info
		this._lastStatus = null;
		this._lastPlayPauseFile = null;
		this._lastMetadataDump = null;
		this._currentPlayer = null;

		// Polling
		this._currentInterval = null;
		this._pollTimer = null;

		// Settings
		this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, instance_id);

		// Bind settings
		this._bindSettings();

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
		this.textVBox = new St.BoxLayout({ vertical: true });
		this.mainBox.add_child(this.textVBox);

		this.labelTitle = new St.Label({
		text: "Loading…",
		x_expand: true,
		y_expand: true
		});
		this.textVBox.add_child(this.labelTitle);

		this.labelArtist = new St.Label({
		text: "",
		x_expand: true,
		y_expand: true
		});
		this.textVBox.add_child(this.labelArtist);

		// Context Menu Open Rhythmbox
		this._menu.addAction(_('Open Rhythmbox'), Lang.bind(this, function () {
		GLib.spawn_command_line_async(`rhythmbox`);
		}));
		this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		// Context Menu Play/Pause Track
		this._menu.addAction(_('Play/Pause Track'), Lang.bind(this, function () {
		GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} play-pause`);
		this._updateStatus();
		}));
		// Context Menu Next Track
		this._menu.addAction(_('Next Track'), Lang.bind(this, function () {
		GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} next`);
		this._updateStatus();
		}));
		// Context Menu Previous Track
		this._menu.addAction(_('Previous Track'), Lang.bind(this, function () {
		GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} previous`);
		this._updateStatus();
		}));
		// Context Menu Stop Player
		this._menu.addAction(_('Stop Player'), Lang.bind(this, function () {
		GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} stop`);
		this._updateStatus();
		}));

		// Initial run
		this._updateAll();
		this._startPolling(this.idlePollInterval);
	},

	_checkPlayerctlInstalled: function() {
	return !!GLib.find_program_in_path("playerctl");
	},

	_bindSettings: function() {
		const settings = this.settings;
		const bind = Lang.bind;

		// Line 1
		settings.bind("line1_format", "line1Format", bind(this, this._updateAll));
		settings.bind("line1_font", "line1Font", bind(this, this._updateAll));
		settings.bind("line1_size", "line1Size", bind(this, this._updateAll));
		settings.bind("line1_no_player", "line1_no_player", bind(this, this._updateStatus));
		settings.bind("line1_stopped", "line1_stopped", bind(this, this._updateStatus));

		// Line 2
		settings.bind("line2_format", "line2Format", bind(this, this._updateAll));
		settings.bind("line2_font", "line2Font", bind(this, this._updateAll));
		settings.bind("line2_size", "line2Size", bind(this, this._updateAll));
		settings.bind("line2_no_player", "line2_no_player", bind(this, this._updateStatus));
		settings.bind("line2_stopped", "line2_stopped", bind(this, this._updateStatus));

		// Buttons
		settings.bind("btn_play_texture", "btnPlayTexture", bind(this, this._updateAll));
		settings.bind("btn_pause_texture", "btnPauseTexture", bind(this, this._updateAll));
		settings.bind("btn_next_texture", "btnNextTexture", bind(this, this._updateAll));
		settings.bind("btn_prev_texture", "btnPrevTexture", bind(this, this._updateAll));
		settings.bind("hide_skip_buttons", "hideSkipButtons", bind(this, this._updateAll));
		settings.bind("hide_all_buttons", "hideAllButtons", bind(this, this._updateAll));
		settings.bind("button_text_spacing", "buttonTextSpacing", bind(this, this._updateAll));
		settings.bind("button_size", "buttonSize", bind(this, this._updateAll));

		// Player settings
		settings.bind("player_whitelist", "playerWhitelist", bind(this, this._updateAll));
		settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", bind(this, this._updateAll));
		settings.bind("poll_interval", "pollInterval", bind(this, this._resetPolling));
		settings.bind("idle_poll_interval", "idlePollInterval", bind(this, this._resetPolling));
		settings.bind("empty_values", "emptyValues", bind(this, this._updateAll));
		settings.bind("debug_mode", "debugMode", bind(this, this._updateAll));
	},

	_startPolling: function(interval) {
		// cancel existing timer if any
		if (this._pollTimer) {
			GLib.source_remove(this._pollTimer);
			this._pollTimer = null;
		}

		// store and start new timer
		this._currentInterval = interval;
		const ms = Math.round(interval * 1000)
		this._pollTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, Lang.bind(this, this._updateStatus));
		if (this.debugMode) {
			global.log(`[music-display@nicholasjdi] resetting poll interval to ${this._currentInterval}s`);
		}
	},

	_resetPolling: function() {
		const interval = (this._lastStatus && this._lastStatus !== "Stopped")
			? this.pollInterval
			: this.idlePollInterval;

		this._startPolling(interval);
	},

	_updateAll: function() {
		this._lastStatus = "Reload";
		this._updateFont();
		this.spacingWidget.width = Math.max(0, Math.round(this.buttonTextSpacing));
		this._updateStatus();
	},

	_updateFont: function() {
		this.labelTitle.style = `${this.line1Font ? "font-family:" + this.line1Font + ";" : ""} font-size: ${this.line1Size}px;`;
		this.labelArtist.style = `${this.line2Font ? "font-family:" + this.line2Font + ";" : ""} font-size: ${this.line2Size}px;`;
		if (this.debugMode) {
		global.log(`[music-display@nicholasjdi] Update font`);
		}
	},

	_getPlayerctlArgsArray: function() {
		if (!this.playerWhitelist || !this.playerWhitelist.toString().trim()) return [];
		const players = this.playerWhitelist.split(",").map(p => p.trim()).filter(p => p.length > 0).join(",");
		if (!players) return [];
		const flag = this.treatWhitelistAsBlacklist ? `--ignore-player=${players}` : `--player=${players}`;
		return [flag];
	},

	_runPlayerctlAsync: function(argsArray, callback) {
		try {
			const argv = ['playerctl'];
			const extra = this._getPlayerctlArgsArray();
			for (let e of extra) argv.push(e);
			for (let a of argsArray) argv.push(a);

			let proc = new Gio.Subprocess({
				argv: argv,
				flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
			});

			proc.init(null);
			proc.communicate_utf8_async(null, null, (procObj, res) => {
				try {
					let [ok, stdout, stderr] = procObj.communicate_utf8_finish(res);
					callback(ok && stdout ? stdout.toString().trim() : "");
				} catch (e) {
					callback("");
				}
			});
		} catch (e) {
			callback("");
		}
	},

	_fetchCustomTagsAsync: function(formatStr, callback) {
		// Quick check: if it doesn't contain all required chars, return the string as-is
		if (!formatStr.includes('%') || !formatStr.includes('(') || !formatStr.includes(')') || !formatStr.includes('[') || !formatStr.includes(']')) {
			callback(formatStr);
			return;
		}

		const emptyValues = (this.emptyValues || "").split(",").map(s => s.trim()).filter(Boolean);
		let result = "";
		let idx = 0;

		const processNext = () => {
			if (idx >= formatStr.length) {
				callback(result);
				return;
			}

			let nextPercent = formatStr.indexOf('%', idx);
			if (nextPercent === -1) {
				result += formatStr.slice(idx);
				callback(result);
				return;
			}

			// append text before %
			result += formatStr.slice(idx, nextPercent);
			idx = nextPercent;

			// parse the full tag (respect parentheses so % inside (...) is ignored)
			let stack = [];
			let end = idx + 1;
			let found = false;
			while (end < formatStr.length) {
				if (formatStr[end] === '%' && stack.length === 0) {
					found = true;
					break;
				} else if (formatStr[end] === '(') {
					stack.push('(');
				} else if (formatStr[end] === ')') {
					if (stack.length) stack.pop();
				}
				end++;
			}

			if (!found) {
				// invalid tag, just append the remaining text
				result += formatStr.slice(idx);
				callback(result);
				return;
			}

			const tagContent = formatStr.slice(idx + 1, end); // between % and %
			idx = end + 1; // move past closing %

			// --- Robust prefix/suffix extraction using stack-aware parsing ---
			let prefix = "", suffix = "", middle = tagContent;

			// Extract prefix if it starts with '(' — find matching ')'
			if (middle.startsWith('(')) {
				let depth = 0;
				for (let i = 0; i < middle.length; i++) {
					const ch = middle[i];
					if (ch === '(') depth++;
					else if (ch === ')') {
						depth--;
						if (depth === 0) {
							prefix = middle.slice(1, i);
							middle = middle.slice(i + 1);
							break;
						}
					}
				}
			}

			// Extract suffix if it ends with ')' — find matching '('
			if (middle.length && middle[middle.length - 1] === ')') {
				let depth = 0;
				for (let j = middle.length - 1; j >= 0; j--) {
					const ch = middle[j];
					if (ch === ')') depth++;
					else if (ch === '(') {
						depth--;
						if (depth === 0) {
							suffix = middle.slice(j + 1, middle.length - 1);
							middle = middle.slice(0, j);
							break;
						}
					}
				}
			}

			// Handle %[player]key% or %[]key%
			const playerMatch = middle.match(/^\[(.*?)\](.*)$/);
			let player = "";
			let metadataKey = "";

			if (playerMatch) {
				player = playerMatch[1]; // may be empty
				metadataKey = playerMatch[2];
			} else {
				// invalid format, skip tag
				processNext();
				return;
			}

			if (!metadataKey) {
				// invalid metadata:tag, skip tag
				processNext();
				return;
			}

			// decide which player to use
			if (player === "") {
				// user left [ ] empty: use current player from _updateStatus
				player = this._currentPlayer || null;
			} else {
				// user specified a player name — only allow if it matches _currentPlayer
				if (this._currentPlayer && player !== this._currentPlayer) {
					// skip this tag entirely, no prefix/suffix
					processNext();
					return;
				}
			}

			const fetchMetadata = (playerName) => {
				let args = [];
				if (playerName) args.push(`--player=${playerName}`);
				args.push('metadata', metadataKey);

				this._runPlayerctlAsync(args, val => {
					if (!val || emptyValues.includes(val.trim())) {
						// invalid metadata, skip processing prefix/suffix
						processNext();
						return;
					}

					// recursively process prefix and suffix
					this._fetchCustomTagsAsync(prefix, finalPrefix => {
						this._fetchCustomTagsAsync(suffix, finalSuffix => {
							result += finalPrefix + val + finalSuffix;
							processNext();
						});
					});
				});
			};

			// if player is null (no player yet), try first whitelist player
			if (!player) {
				this._runPlayerctlAsync(['-l'], playersOut => {
					const firstPlayer = playersOut.split("\n").find(p => {
						if (!p) return false;
						if (!this.playerWhitelist || !this.playerWhitelist.trim()) return true;
						const players = this.playerWhitelist.split(",").map(x => x.trim());
						return this.treatWhitelistAsBlacklist ? !players.includes(p) : players.includes(p);
					}) || "Player";
					fetchMetadata(firstPlayer);
				});
			} else {
				fetchMetadata(player);
			}
		};

		processNext();
	},

	_updateText: function(playerName) {
		const fields = ['xesam:title', 'xesam:artist', 'xesam:album'];
		const results = {};
		let pending = fields.length;

		fields.forEach(field => {
			this._runPlayerctlAsync(['metadata', field], val => {
				results[field] = val || (field === 'xesam:title' ? "Unknown Title" : field === 'xesam:artist' ? "Unknown Artist" : "Unknown Album");
				pending--;
				if (pending === 0) {
					// all metadata fetched, now build the display text
					const title = results['xesam:title'];
					const artist = results['xesam:artist'];
					const album = results['xesam:album'];

					if (this.debugMode) {
						global.log(`[music-display@nicholasjdi] Resetting text, ${title}, ${artist}, ${album}, ${playerName}.`);
					}

					let base1 = this.line1Format
						.replace(/%title%/g, title)
						.replace(/%artist%/g, artist)
						.replace(/%album%/g, album)
						.replace(/%player%/g, playerName);

					let base2 = this.line2Format
						.replace(/%title%/g, title)
						.replace(/%artist%/g, artist)
						.replace(/%album%/g, album)
						.replace(/%player%/g, playerName);

					// handle custom tags
					this._fetchCustomTagsAsync(base1, final1 => {this.labelTitle.set_text(final1);});
					this._fetchCustomTagsAsync(base2, final2 => {this.labelArtist.set_text(final2);});
				}
			});
		});
	},

	_updateStatus: function() {
		try {
			if (!this._checkPlayerctlInstalled()) {
				this.labelTitle.set_text("playerctl is not installed");
				this.labelArtist.set_text("Use command: sudo apt install playerctl");
				this.buttonVBox.hide();
				this.spacingWidget.hide();
				return true;
			}

			this._runPlayerctlAsync(['status'], statusOut => {
				const status = statusOut ? statusOut.trim() : "";

				// check if we need to change polling interval
				const newInterval = (status && status !== "Stopped")
					? this.pollInterval
					: this.idlePollInterval;

				if (newInterval !== this._currentInterval) {
					this._startPolling(newInterval);
				}

				const statusChanged = (status !== this._lastStatus);
				this._lastStatus = status;

				let showButtons = true;

				if (!status) {
					// No player
					this.labelTitle.set_text(this.line1_no_player);
					this.labelArtist.set_text(this.line2_no_player);
					showButtons = false;
				} else if (status === "Stopped") {
					// Player stopped
					this._runPlayerctlAsync(['-l'], playersOut => {
						let firstPlayer = (playersOut || "").split("\n")[0] || "Player";
						this.labelTitle.set_text(this.line1_stopped.replace(/%player%/g, firstPlayer));
						this.labelArtist.set_text(this.line2_stopped.replace(/%player%/g, firstPlayer));
					});
					showButtons = false;
				} else {
					// Playing / Paused
					this._runPlayerctlAsync(['-l'], playersOut => {
						// build clean array of reported players
						const playersList = (playersOut || "").split("\n").map(s => s && s.trim()).filter(Boolean);

						const whitelist = (this.playerWhitelist || "").split(",").map(x => x.trim()).filter(Boolean);

						// choose a reported entry where the base name (before '.') matches whitelist (or any if whitelist empty)
						const pick = playersList.find(p => {
							if (!p) return false;
							const base = p.split(".")[0];				 // normalize reported name
							if (!whitelist.length) return true;			 // no whitelist => accept first valid
							return this.treatWhitelistAsBlacklist
								? !whitelist.includes(base)
								: whitelist.includes(base);
						}) || null; // null means no concrete pick

						// normalise to base name (e.g. firefox.12345 -> firefox)
						const firstPlayer = pick ? pick.split(".")[0] : "Player";

						// store normalized current player for tag checks
						this._currentPlayer = firstPlayer;

						// Build metadata args. If we have a concrete pick (e.g. firefox.12345),
						// pass --player=pick so it overrides any whitelist flags (playerctl respects the rightmost --player=).
						const metaArgs = [];
						if (pick) metaArgs.push(`--player=${pick}`);
						metaArgs.push('metadata');

						// Fetch full metadata dump and compare to last dump
						this._runPlayerctlAsync(metaArgs, metadataDump => {
							const dump = metadataDump || "";

							const metadataChanged = (dump !== this._lastMetadataDump);

							if (statusChanged || metadataChanged) {
								if (this.debugMode) {
									global.log(`[music-display@nicholasjdi] update triggered (statusChanged=${statusChanged}, metadataChanged=${metadataChanged})`);
								}

								// store new metadata dump and status
								this._lastMetadataDump = dump;

								// Now update text/buttons
								this._updateText(firstPlayer);
								const isPlaying = (status === "Playing");
								this._updateButtonTextures(isPlaying);
							} else {
								if (this.debugMode) {
									global.log(`[music-display@nicholasjdi] no change in metadata/status, skipping update`);
								}
							}
						});
					});
				}

				// Buttons / spacing (visibility is independent of whether we updated text)
				if (!showButtons || this.hideAllButtons) {
					this.buttonVBox.hide();
					this.spacingWidget.hide();
				} else {
					this.buttonVBox.show();
					this.spacingWidget.show();
					this.spacingWidget.width = Math.max(0, Math.round(this.buttonTextSpacing));
					this.hideSkipButtons ? this.skipHBox.hide() : this.skipHBox.show();
				}
			});
		} catch (e) {
			global.logError(`[music-display@nicholasjdi] _updateStatus exception: ${e}`);
		} finally {
			if (this.debugMode) {
				global.log(`[music-display@nicholasjdi] polling every ${this._currentInterval}s`);
			}
			return true
		}
	},

	_updateButtonTextures: function(isPlaying) {
		if (this.debugMode) {
		global.log(`[music-display@nicholasjdi] Update buttons`);
		}
		const basePath = this.metadata.path + "/textures/";
		const playTexture = this.btnPlayTexture || basePath + "play.png";
		const pauseTexture = this.btnPauseTexture || basePath + "pause.png";
		const prevTexture = this.btnPrevTexture || basePath + "previous.png";
		const nextTexture = this.btnNextTexture || basePath + "next.png";

		let playPauseFile = isPlaying ? pauseTexture : playTexture;
		if (playPauseFile !== this._lastPlayPauseFile || this._lastPlayPauseSize !== this.buttonSize) {
			this.btnPlayPause.set_child(new St.Icon({
				gicon: Gio.icon_new_for_string(playPauseFile),
				icon_size: this.buttonSize
			}));
			this.btnPlayPause.height = this.buttonSize;
			this._lastPlayPauseFile = playPauseFile;
			this._lastPlayPauseSize = this.buttonSize;
		}


		if (!this.hideSkipButtons && !this.hideAllButtons) {
			let skipSize = Math.floor(this.buttonSize / 2);
			this.btnPrev.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(prevTexture), icon_size: skipSize }));
			this.btnPrev.height = skipSize;
			this.btnNext.set_child(new St.Icon({ gicon: Gio.icon_new_for_string(nextTexture), icon_size: skipSize }));
			this.btnNext.height = skipSize;
		}
	},

	_onPlayPausePressed: function(actor, event) {
		if (event.get_button() === 1) {
			GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} play-pause`);
			this._updateStatus();
		}
	},

	_onPrevPressed: function(actor, event) {
		if (event.get_button() === 1) {
			GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} previous`);
			this._updateStatus();
		}
	},

	_onNextPressed: function(actor, event) {
		if (event.get_button() === 1) {
			GLib.spawn_command_line_async(`playerctl ${this._getPlayerctlArgsArray().join(' ')} next`);
			this._updateStatus();
		}
	},

	on_desklet_removed: function() {
		if (this._pollId) {
			GLib.source_remove(this._pollId);
			this._pollId = null;
		}
	}
};

function main(metadata, instance_id) {
	return new MusicDisplayDesklet(metadata, instance_id);
}
