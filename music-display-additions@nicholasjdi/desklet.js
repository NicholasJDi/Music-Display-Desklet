const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const Pango = imports.gi.Pango;
const Soup = imports.gi.Soup;

function MusicDisplayAdditionsDesklet(metadata, instance_id) {
	this._init(metadata, instance_id);
}

MusicDisplayAdditionsDesklet.prototype = {
	__proto__: Desklet.Desklet.prototype,

	_init: function (metadata, instance_id) {
		Desklet.Desklet.prototype._init.call(this, metadata, instance_id);
		this.metadata = metadata;

		// default props, will be overwritten by settings.bind()
		this.xSize = 200;
		this.ySize = 200;
		this.position = "bottom_left";
		this.xOffset = 10;
		this.yOffset = -10;
		this.margin = 5;
		this.marginColor = "white";
		this.backgroundColor = "black";
		this.timeFormat = "%time%";
		this.font = "sans 12";
		this.color = "white";
		this.textEnabled = true;
		this.artEnabled = true;
		this.pollInterval = 0.5;
		this.idlePollInterval = 3;
		this.playerWhitelist = "rhythmbox,spotify";
		this.treatWhitelistAsBlacklist = false;
		this.debugMode = false;
		this.overridesEnabled = false;
		this.overridesDirectory = "";
		this.disabled = false;
		this.noArtPosition = "top_right";
		this.noArtXOffset = -4;
		this.noArtYOffset = 4;

		this._hideArt = true;
		this._artSize = null;
		this._currentInterval = null;
		this._lastMetadataDump = null;
		this._lastStatus = null;
		this._soupSession = new Soup.Session();
		this._failArt = false;

		// build container
		this.container = new St.Widget({ reactive: true });
		this.setContent(this.container);

		// backdrop behind art
		this.backdrop = new St.Widget({ reactive: true});
		this.container.add_actor(this.backdrop);

		// cover art
		this.art = new St.Icon({ icon_size: this.xSize });
		this.container.add_actor(this.art);

		// single time label
		this.timeLabel = new St.Label({ text: "", style: "" });
		this.container.add_actor(this.timeLabel);

		// settings binding
		this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, instance_id);
		const bind = Lang.bind;
		this.settings.bind("x_size", "xSize", bind(this, this._updateLayout));
		this.settings.bind("y_size", "ySize", bind(this, this._updateLayout));
		this.settings.bind("position", "position", bind(this, this._positionLabel));
		this.settings.bind("x_offset", "xOffset", bind(this, this._positionLabel));
		this.settings.bind("y_offset", "yOffset", bind(this, this._positionLabel));
		this.settings.bind("margin", "margin", bind(this, this._updateLayout));
		this.settings.bind("margin_color", "marginColor", bind(this, this._updateLayout));
		this.settings.bind("background_color", "backgroundColor", bind(this, this._updateLayout));
		this.settings.bind("format", "timeFormat", bind(this, this._updateTime));
		this.settings.bind("font", "font", bind(this, this._updateFont));
		this.settings.bind("color", "color", bind(this, this._updateFont));
		this.settings.bind("text_enabled", "textEnabled", bind(this, this._updateTime));
		this.settings.bind("art_enabled", "artEnabled", bind(this, this._updateArt));
		this.settings.bind("poll_interval", "pollInterval", bind(this, this._resetPolling));
		this.settings.bind("idle_poll_interval", "idlePollInterval", bind(this, this._resetPolling));
		this.settings.bind("player_whitelist", "playerWhitelist", bind(this, this._updateStatus));
		this.settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", bind(this, this._updateStatus));
		this.settings.bind("debug_mode", "debugMode", null);
		this.settings.bind("overrides_enabled", "overridesEnabled", bind(this, this._toggleDesklet));
		this.settings.bind("art_dir", "overridesDirectory", bind(this, this._updateArt));
		this.settings.bind("disabled", "disabled", bind(this, this._toggleDesklet));
		this.settings.bind("no_art_position", "noArtPosition", bind(this, this._positionLabel));
		this.settings.bind("no_art_x_offset", "noArtXOffset", bind(this, this._positionLabel));
		this.settings.bind("no_art_y_offset", "noArtYOffset", bind(this, this._positionLabel));

		// context menu
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
		this._menu.addAction(_('Reload'), Lang.bind(this, this._toggleDesklet));
		

		// initial setup
		this.art.hide();
		this._updateFont();
		this._updateLayout();
		this._toggleDesklet();
	},
	
	_toggleDesklet: function () {
		this.checkbox.setToggleState(this.disabled);
		this.overridesCheckbox.setToggleState(this.overridesEnabled);
		if (this.debugMode) {
			global.log(`[music-display@nicholasjdi] toggled desklet, enabled: ${!this.disabled}`);
		}
		if (this._posTimeout) {
			GLib.source_remove(this._posTimeout);
			this._posTimeout = null;
		}
		if (this._pollTimer) {
			GLib.source_remove(this._pollTimer);
			this._pollTimer = null;
		}
		this._lastStatus = null;
		this._lastMetadataDump = null;
		this._updateStatus();
		if (!this.disabled) {
			this._resetPolling();
		}
	},

	_startPolling: function (interval) {
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

	_resetPolling: function () {
		this._startPolling(this.pollInterval);
	},

	_getPlayerctlArgsArray: function() {
		if (!this.playerWhitelist || !this.playerWhitelist.toString().trim()) return [];
		const players = this.playerWhitelist.split(",").map(p => p.trim()).filter(p => p.length > 0).join(",");
		if (!players) return [];
		const flag = this.treatWhitelistAsBlacklist ? `--ignore-player=${players}` : `--player=${players}`;
		return [flag];
	},

	_runPlayerctlAsync: function (argsArray, callback) {
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

	_updateStatus: function () {
		try {
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

				if (!status || status === "Stopped") {
					// No Player / Stopped
					this._setTimeText();
					this._setArt("");
				} else {
					// Playing / Paused
					this._runPlayerctlAsync(['metadata'], metadataDump => {
						const dump = metadataDump || "";

						const metadataChanged = (dump !== this._lastMetadataDump);
						this._lastMetadataDump = dump;

						// Update time
						if (this.textEnabled) this._updateTime();
						else this._setTimeText("");

						if (statusChanged || metadataChanged) {
							if (this.debugMode) {
								global.log(`[music-display-additions@nicholasjdi] art update triggered (statusChanged=${statusChanged}, metadataChanged=${metadataChanged})`);
							}

							// Update art
							if (this.artEnabled) this._updateArt();
							else this._setArt("");
						} else {
							if (this.debugMode) {
								global.log(`[music-display-additions@nicholasjdi] no change in metadata/status, skipping art update`);
							}
						}
					});
				}
			});
		} catch (e) {
			global.logError(`[music-display-additions@nicholasjdi] _updateStatus exception: ${e}`);
		} finally {
			if (this.debugMode) {
				global.log(`[music-display-additions@nicholasjdi] polling every ${this._currentInterval}s`);
			}
			return true
		}
	},

	_updateTime: function () {
		try {
			if (this.disabled || !this.textEnabled) {
				this._setTimeText("");
				return true;
			}
			this._runPlayerctlAsync(['position'], timeOut => {
				this._runPlayerctlAsync(['metadata', 'mpris:length'], lengthOut => {
					lengthOut = lengthOut / 1000000
					const timeSeconds = Math.floor(timeOut);
					const timeMinutes = Math.floor(timeOut / 60);
					const timeHours = Math.floor(timeOut / 3600);
					const lengthSeconds = Math.floor(lengthOut);
					const lengthMinutes = Math.floor(lengthOut / 60);
					const lengthHours = Math.floor(lengthOut / 3600);
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
				});
			});
		} catch (e) {
			global.logError(`[music-display-additions@nicholasjdi] _updateTime exception: ${e}`);
		}
	},

	_updateArt: function () {
		try {
			this._runPlayerctlAsync(['metadata', "mpris:artUrl"], artUrlOut => {
				let artUrl = artUrlOut;

				// If overrides are enabled, try to find a local override image
				if (this.overridesEnabled && this.overridesDirectory) {
					// to build your own file name pattern.
					this._runPlayerctlAsync(['metadata', 'xesam:artist'], artist => {
						this._runPlayerctlAsync(['metadata', 'xesam:title'], title => {
							let safeArtist = (artist || 'unknown').replace(/[/\\?%*:|"<>]/g, '_');
							let safeTitle = (title || 'unknown').replace(/[/\\?%*:|"<>]/g, '_');

							const exts = ['png','jpg','jpeg','webp'];
							for (let ext of exts) {
								let candidate = GLib.build_filenamev([this.overridesDirectory, `${safeArtist} - ${safeTitle}.${ext}`]);
								if (GLib.file_test(candidate.replace("file://",""), GLib.FileTest.EXISTS)) {
									artUrl = candidate;
									if (this.debugMode) {
										global.log(`[music-display@nicholasjdi] grabbed override art from ${artUrl}`);
									}
									break;
								}
							}
							this._setArt(artUrl);
						});
					});
				} else this._setArt(artUrl);
			});
		} catch (e) {
			global.logError(`[music-display-additions@nicholasjdi] _updateArt exception: ${e}`);
		}
	},

	_setTimeText: function(text) {
		try {
			if (!text || text === "") {
				this.timeLabel.hide();
				if (this.disabled || !text) this.timeLabel.set_text(" ");
				return true;
			} else if (!this.timeLabel.visible) {
				this.timeLabel.show();
			}
			if (this.debugMode) {
				global.log(`[music-display@nicholasjdi] setting time text to ${text}`);
			}
			this.timeLabel.set_text(text);
			this._positionLabel();
		} catch (e) {global.logError(`[music-display-additions@nicholasjdi] _setTimeText exception: ${e}`);}
	},

	_setArt: function (artUrl) {
		try {
			if (!artUrl || artUrl === "") {
				this._hideArt = true;
				this._updateLayout();
				return true;
			}
			this._artSize = Math.min(this.xSize - 2 * this.margin, this.ySize - 2 * this.margin);
			if (artUrl.startsWith("https://")) {
				if (this.debugMode) {
					global.log(`[music-display@nicholasjdi] parsing art from url: ${artUrl}`);
				}
				this._loadArtFromUrl(artUrl);
			} else {
				if (this.debugMode) {
					global.log(`[music-display@nicholasjdi] parsing art from file: ${artUrl}`);
				}
				this._loadArtFromFile(artUrl);
			}
		} catch (e) {global.logError(`[music-display-additions@nicholasjdi] _setTimeText exception: ${e}`);}
	},

	_loadArtFromFile: function (artPath) {
		try {
			if (!artPath) {
				this._hideArt = true;
				this._updateLayout();
				this.art.set_icon("");
				return true;
			}

			// Normalize path
			let localPath = artPath.replace("file://", "");
			if (!GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
				global.logWarning(`[music-display@nicholasjdi] File does not exist: ${localPath}`);
				this._hideArt = true;
				return true;
			}

			// Set icon size first
			this.art.icon_size = this._artSize || 200;

			// Load file
			let file = Gio.File.new_for_path(localPath);
			let fileIcon = new Gio.FileIcon({ file: file });
			this.art.set_gicon(fileIcon);
			this.art.show();

			if (this.debugMode) global.log(`[music-display@nicholasjdi] loaded art from file: ${localPath}`);
		} catch (e) {
			global.logWarning(`[music-display@nicholasjdi] Could not load art from file: ${artPath}, Error: ${e.message}`);
			this._hideArt = true;
		} finally {
			this._updateLayout();
		}
	},


	_loadArtFromUrl: function (artUrl) {
		try {
			// Build GET message
			let message = Soup.Message.new('GET', artUrl);

			// Send asynchronously
			this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
				try {
					// Get bytes from response
					let bytes = this._soupSession.send_and_read_finish(res);
					// Check status code
					if (message.get_status() !== Soup.Status.OK) {
						global.logWarning(`[music-display@nicholasjdi] Failed to download image: ${artUrl} status ${message.get_status()}`);
						this._hideArt = true;
						return true;
					}

					// Grab url hash
					const hash = GLib.compute_checksum_for_string(
						GLib.ChecksumType.SHA256,
						artUrl,
						-1
					).substring(0,16);

					// Save to temp file
					let tmpPath = GLib.build_filenamev([GLib.get_tmp_dir(), `music_display_art_${hash}.png`]);
					GLib.file_set_contents(tmpPath, bytes.get_data());

					if (this.debugMode) {
						global.log(`[music-display@nicholasjdi] grabbed art from url: ${artUrl}`);
					}

					// Load it as local file
					this._loadArtFromFile(tmpPath);
					GLib.unlink(tmpPath);
				} catch (e) {
					global.logWarning(`[music-display@nicholasjdi] Error reading response: ${e.message}`);
					this._hideArt = true;
				}
			});
		} catch (e) {
			global.logWarning(`[music-display@nicholasjdi] Could not load art from URL: ${artUrl}, Error: ${e.message}`);
			this._hideArt = true;
		} finally {if (this._hideArt) this._updateLayout();}
	},

	_updateLayout: function () {
		// set container size
		this.container.width = this.xSize;
		this.container.height = this.ySize;

		if (this.artEnabled && !this._hideArt && !this.disabled && !this._failArt) {
			this._artSize = Math.min(this.xSize - 2 * this.margin, this.ySize - 2 * this.margin);
			this.art.icon_size = this._artSize;
			this.art.set_position(this.margin, this.margin);
			this.backdrop.set_position(this.margin, this.margin);
			this.backdrop.set_size(this._artSize, this._artSize)
			this.art.show();
			this.backdrop.style = `background-color: ${this.backgroundColor};`;
			if (this.margin > 0) this.container.style = `background-color: ${this.marginColor};`;
			else this.container.style = ``;
		} else {
			this._hideArt = false;
			this.art.hide();
			this.container.style = "";
			this.backdrop.style = "";
		}

		this._positionLabel();
	},

	_updateFont: function () {
		// parse the font string from the settings
		let desc = Pango.font_description_from_string(this.font);

		// get family
		let family = desc.get_family();
		// get size in points
		let size = desc.get_size() / Pango.SCALE; // Pango stores size*Pango.SCALE
		// get weight and style
		let weight = desc.get_weight(); // e.g. 400, 700 etc.
		let style = desc.get_style();	// 0 = normal, 1 = oblique, 2 = italic

		// turn weight/style into CSS-friendly strings
		let weightStr = (weight >= Pango.Weight.BOLD) ? 'bold' : 'normal';
		let styleStr = (style === Pango.Style.ITALIC) ? 'italic'
						: (style === Pango.Style.OBLIQUE) ? 'oblique' : 'normal';

		// now build a style string for St.Label
		this.timeLabel.style =
			'font-family: ' + family + '; ' +
			'font-weight: ' + weightStr + '; ' +
			'font-style: ' + styleStr + '; ' +
			'font-size: ' + size + 'pt; ' +
			'color: ' + this.color + ';';

		this._positionLabel();
	},

	_positionLabel: function () {
		// run on idle so label size is known
		this._posTimeout = GLib.timeout_add(
			GLib.PRIORITY_DEFAULT_IDLE,
			0,
			Lang.bind(this, function () {
				if (this._posTimeout) {
					GLib.source_remove(this._posTimeout);
					this._posTimeout = null;
				}
				if (this.textEnabled) this.timeLabel.show();
				else {
					this.timeLabel.hide();
				}

				let position = this.position;
				let xOffset = this.xOffset;
				let yOffset = this.yOffset;
				if (this.artEnabled && !this.art.visible) {
					position = this.noArtPosition;
					xOffset = this.noArtXOffset;
					yOffset = this.noArtYOffset;
				}

				const labelW = this.timeLabel.get_width();
				const labelH = this.timeLabel.get_height();
				const dsW = this.container.width;
				const dsH = this.container.height;
				const m = this.margin;

				let anchorX = 0, anchorY = 0;
				switch (position) {
					case "top_left":	 anchorX = m;		 anchorY = m;		 break;
					case "top_right":	 anchorX = dsW - m;	 anchorY = m;		 break;
					case "bottom_left":  anchorX = m;		 anchorY = dsH - m;	 break;
					case "bottom_right": anchorX = dsW - m;	 anchorY = dsH - m;	 break;
					case "center":		 anchorX = dsW / 2;	 anchorY = dsH / 2;	 break;
					default:			 anchorX = dsW - m;	 anchorY = m;		 break;
				}

				let leftX, topY;
				if (position.endsWith("_left"))
					leftX = anchorX + xOffset;
				else if (position.endsWith("_right"))
					leftX = anchorX - labelW + xOffset;
				else
					leftX = anchorX - Math.round(labelW / 2) + xOffset;

				if (position.startsWith("top"))
					topY = anchorY + yOffset;
				else if (position.startsWith("bottom"))
					topY = anchorY - labelH + yOffset;
				else
					topY = anchorY - Math.round(labelH / 2) + yOffset;

				this.timeLabel.set_position(Math.round(leftX), Math.round(topY));
				return false;
			})
		);
	},

	on_checkbox_toggled: function (checkbox, value) {
		this.disabled = value;
		this._toggleDesklet();
	},

	on_overridesCheckbox_toggled: function (checkbox, value) {
		this.overridesEnabled = value;
		this._toggleDesklet();
	},

	on_failCheckbox_toggled: function (checkbox, value) {
		this._failArt = value;
		this._toggleDesklet();
	},

	on_desklet_removed: function () {
		if (this._posTimeout) {
			GLib.source_remove(this._posTimeout);
			this._posTimeout = null;
		}
		if (this._pollTimer) {
			GLib.source_remove(this._pollTimer);
			this._pollTimer = null;
		}
		delete this._soupSession;
		this.settings.finalize();
	}

};

function main(metadata, instance_id) {
	return new MusicDisplayAdditionsDesklet(metadata, instance_id);
}
