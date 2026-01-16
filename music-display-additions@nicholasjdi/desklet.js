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

		// default props, will be overwritten by settings.bind()
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

		this._hideArt = true;
		this._artSize = null;
		this._imageSize = {width: 10, height: 10};
		this._currentInterval = null;
		this._lastMetadataDump = null;
		this._lastStatus = null;
		this._lastTimeText = null;
		this._lastArtUrl = null;
		this._soupSession = new Soup.Session();
		this._pollTimer = null;
		this._failArt = false;
		this._lastMixTitle = null;
		this._currentPlayerctlArgs = null;

		// build container
		this.container = new St.Widget({ reactive: true });
		this.setContent(this.container);

		// art outline margin
		this.margin = new St.Widget({ reactive: true });
		this.container.add_actor(this.margin);

		// backdrop behind art
		this.backdrop = new St.Widget({ reactive: true});
		this.container.add_actor(this.backdrop);

		// cover art
		this.art = new St.Widget({ reactive: true });
		this.container.add_actor(this.art);

		// outline labels
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

		// time label
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
		this.settings.bind("margin", "marginSize", bind(this, this._updateLayout));
		this.settings.bind("margin_color", "marginColor", bind(this, this._updateLayout));
		this.settings.bind("background_color", "backgroundColor", bind(this, this._updateLayout));
		this.settings.bind("format", "timeFormat", bind(this, this._updateTime));
		this.settings.bind("font", "font", bind(this, this._updateFont));
		this.settings.bind("color", "color", bind(this, this._updateFont));
		this.settings.bind("text_enabled", "textEnabled", bind(this, this._updateTime));
		this.settings.bind("art_enabled", "artEnabled", bind(this, this._toggleDesklet));
		this.settings.bind("art_position", "artPosition", bind(this, this._updateLayout));
		this.settings.bind("text_in_art", "textInArt", bind(this, this._positionLabel));
		this.settings.bind("poll_interval", "pollInterval", bind(this, this._resetPolling));
		this.settings.bind("idle_poll_interval", "idlePollInterval", bind(this, this._resetPolling));
		this.settings.bind("player_whitelist", "playerWhitelist", bind(this, this._updateStatus));
		this.settings.bind("treat_whitelist_as_blacklist", "treatWhitelistAsBlacklist", bind(this, this._updateStatus));
		this.settings.bind("debug_mode", "debugMode", null);
		this.settings.bind("overrides_enabled", "overridesEnabled", bind(this, this._toggleDesklet));
		this.settings.bind("art_dir", "overridesDirectory", bind(this, this._updateStatus));
		this.settings.bind("mix_detection", "mixDetection", bind(this, this._toggleDesklet));
		this.settings.bind("disabled", "disabled", bind(this, this._toggleDesklet));
		this.settings.bind("no_art_position", "noArtPosition", bind(this, this._positionLabel));
		this.settings.bind("no_art_x_offset", "noArtXOffset", bind(this, this._positionLabel));
		this.settings.bind("no_art_y_offset", "noArtYOffset", bind(this, this._positionLabel));
		this.settings.bind("outline_enabled", "outlineEnabled", bind(this, this._toggleDesklet));
		this.settings.bind("outline_size", "outlineSize", bind(this, this._updateTime));
		this.settings.bind("outline_color", "outlineColor", bind(this, this._updateFont));

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
			global.log(`[music-display-additions@nicholasjdi] toggled desklet, enabled: ${!this.disabled}`);
		}
		if (this._pollTimer) {
			GLib.source_remove(this._pollTimer);
			this._pollTimer = null;
		}
		this._lastStatus = null;
		this._lastMetadataDump = null;
		this._lastMixTitle = null;
		this._lastTimeText = null;
		this._updateStatus();
		this._resetPolling();
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
			global.log(`[music-display-additions@nicholasjdi] resetting poll interval to ${this._currentInterval}s`);
		}
	},

	_resetPolling: function () {
		if (!this.disabled) this._startPolling(this.pollInterval);
	},

	_getPlayerctlArgsArray: function (callback) {
		try {
			if (!this.playerWhitelist.toString().trim()) return [];
			const whitelist = this.playerWhitelist.split(",").map(p => p.trim()).filter(p => p.length > 0).join(",");
			if (!whitelist) return [];
			this._currentPlayerctlArgs = [this.treatWhitelistAsBlacklist ? `--ignore-player=${whitelist}` : `--player=${whitelist}`]
			this._runPlayerctlAsync(['-l'], playersOut => {
				try {
				// build clean array of reported players
				const playersList = (playersOut || "").split("\n").map(s => s && s.trim()).filter(Boolean);

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
				callback([this.treatWhitelistAsBlacklist ? `--ignore-player=${firstPlayer}` : `--player=${firstPlayer}`]);
				} catch (e) {global.logError(`[music-display@nicholasjdi] _getPlayerctlArgsArray exception: ${e}`);}
			});
		} catch (e) {
			global.logError(`[music-display@nicholasjdi] _getPlayerctlArgsArray exception: ${e}`);
		}
	},

	// this function is so unintelligible
	_runPlayerctlAsync: function (argsArray, callback) {
		try {
			const argv = ['playerctl', ...this._currentPlayerctlArgs, ...argsArray];

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
					global.logError(`[music-display@nicholasjdi] _runPlayerctlAsync exception: ${e}`);
					callback("");
				}
			});
		} catch (e) {
			global.logError(`[music-display@nicholasjdi] _runPlayerctlAsync exception: ${e}`);
			callback("");
		}
	},

	_grabMixTitleOverride: function (text, time) {
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
			global.logError(`[music-display-additions@nicholasjdi] _grabMixTitleOverride exception: ${e}`);
		}
	},

	_updateStatus: function () {
		try {
			this._getPlayerctlArgsArray(argsOut => {
				this._currentPlayerctlArgs = argsOut
				this._runPlayerctlAsync(['status'], statusOut => {
					const status = statusOut ? statusOut.trim() : "";

					// check if we need to change polling interval
					const newInterval = (status && status !== "Stopped")
						? this.pollInterval
						: this.idlePollInterval;

					if (newInterval !== this._currentInterval && this._lastStatus) {
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

						// Update time
						if (this.textEnabled) this._updateTime();
						else this._setTimeText("");
						// Update art
						if (this.artEnabled && !this.disabled) {
							this._runPlayerctlAsync(['metadata'], metadataDump => {
								const dump = metadataDump || "";

								const metadataChanged = (dump !== this._lastMetadataDump);
								this._lastMetadataDump = dump;

								if (statusChanged || metadataChanged) {
									if (this.debugMode) {
										global.log(`[music-display-additions@nicholasjdi] art update triggered (statusChanged=${statusChanged}, metadataChanged=${metadataChanged})`);
									}
									this._lastMixTitle = null;
									// yes this is a stupid way to do this but i can't think of a better way
									if (this.mixDetection && this.overridesEnabled) {
										this._runPlayerctlAsync(['metadata','xesam:comment'], comment => {
											if (comment.includes('[') && comment.includes(']: ')) {
												this._runPlayerctlAsync(['position'], time => {
													const mixTitle = this._grabMixTitleOverride(comment,time);
													this._lastMixTitle = mixTitle;
													this._updateArt(mixTitle);
												});
											} else this._updateArt();
										});
									} else this._updateArt();
								} else if (this.mixDetection && this.overridesEnabled) {
									this._runPlayerctlAsync(['metadata','xesam:comment'], comment => {
										if (comment.includes('[') && comment.includes(']: ')) {
											this._runPlayerctlAsync(['position'], time => {
												const mixTitle = this._grabMixTitleOverride(comment,time);
												if (mixTitle != this._lastMixTitle) {
													if (this.debugMode) {
														global.log(`[music-display-additions@nicholasjdi] art update triggered because the track is a mix`);
													}
													this._lastMixTitle = mixTitle;
													this._updateArt(mixTitle);
												}
											});
										} else {
											if (this.debugMode) {
												global.log(`[music-display-additions@nicholasjdi] no change in metadata/status, (and track is not a mix) skipping art update`);
											}
										}
									});
								} else if (this.debugMode) {
									global.log(`[music-display-additions@nicholasjdi] no change in metadata/status, skipping art update`);
								}
							});
						} else this._setArt("");
					}
				});
			});
		} catch (e) {
			global.logError(`[music-display-additions@nicholasjdi] _updateStatus exception: ${e}`);
		} finally {
			if (this.debugMode) {
				if (!this.disabled) global.log(`[music-display-additions@nicholasjdi] polling every ${this._currentInterval}s`);
				else global.log(`[music-display-additions@nicholasjdi] polling cancelled`);
			}
			return true
		}
	},

	_updateTime: function () {
		try {
			if (this.disabled || !this.textEnabled) {
				this._setTimeText("");
			} else {
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
			}
		} catch (e) {
			global.logError(`[music-display-additions@nicholasjdi] _updateTime exception: ${e}`);
		}
	},

	_updateArt: function (artOverrideTitleOverride = null) {
		try {
			this._runPlayerctlAsync(['metadata', "mpris:artUrl"], artUrlOut => {
				let artUrl = artUrlOut;

				// If overrides are enabled, try to find a local override image
				if (this.overridesEnabled && this.overridesDirectory) {
					// to build your own file name pattern.
					this._runPlayerctlAsync(['metadata', 'xesam:artist'], artist => {
						this._runPlayerctlAsync(['metadata', 'xesam:title'], title => {
							let safeArtist = (artist || 'unknown').replace(/[/\\?%*:|"<>]/g, '_');
							let safeTitle = (artOverrideTitleOverride ? artOverrideTitleOverride : (title || 'unknown')).replace(/[/\\?%*:|"<>]/g, '_');
							const exts = ['png','jpg','jpeg','webp'];
							for (let ext of exts) {
								let candidate = GLib.build_filenamev([this.overridesDirectory, `${safeArtist} - ${safeTitle}.${ext}`]);
								if (GLib.file_test(candidate.replace("file://",""), GLib.FileTest.EXISTS)) {
									artUrl = candidate;
									if (this.debugMode) {
										global.log(`[music-display-additions@nicholasjdi] grabbed override art from ${artUrl}`);
									}
									break;
								}
							}
							if (artUrl == artUrlOut && artOverrideTitleOverride) {
								this._updateArt();
								return;
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
				this.outlineContainer.hide();
				return true;
			} else if (!this.timeLabel.visible & !this.disabled) {
				this.timeLabel.show();
			}
			this.outlineContainer.visible = (this.outlineEnabled & this.timeLabel.visible & !(this.timeLabel.get_text().trim() == ""));
			if (text != this._lastTimeText) {
				if (this.debugMode) {
					global.log(`[music-display-additions@nicholasjdi] setting time text to ${text}`);
				}
				this.timeLabel.set_text(text);
				for (let i = 0; i < 4; i++) {
					this.outlineLabels[i].set_text(text);
				}
				this._lastTimeText = text
			}
			this._positionLabel();
		} catch (e) {global.logError(`[music-display-additions@nicholasjdi] _setTimeText exception: ${e}`);}
	},

	_setArt: function (artUrl) {
		try {
			if (!artUrl || artUrl.trim() === "") {
				this._hideArt = true;
				this._updateLayout();
				return true;
			}
			if (artUrl === this._lastArtUrl) {
				this._updateLayout();
				return true;
			}
			this._lastArtUrl = artUrl;
			if (artUrl.startsWith("https://")) {
				if (this.debugMode) {
					global.log(`[music-display-additions@nicholasjdi] parsing art from url: ${artUrl}`);
				}
				this._loadArtFromUrl(artUrl);
			} else {
				if (this.debugMode) {
					global.log(`[music-display-additions@nicholasjdi] parsing art from file: ${artUrl}`);
				}
				this._loadArtFromFile(artUrl);
			}
		} catch (e) {global.logError(`[music-display-additions@nicholasjdi] _setArt exception: ${e}`);}
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
					if (!artPath) {
						this._hideArt = true;
						this._updateLayout();
						return true;
					}

					// Normalize path
					let localPath = artPath.replace("file://", "");
					if (!GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
						global.logWarning(`[music-display-additions@nicholasjdi] File does not exist: ${localPath}`);
						this._hideArt = true;
						this._updateLayout();
						return true;
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
						true // preserve aspect ratio
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

					if (this.debugMode) global.log(`[music-display-additions@nicholasjdi] loaded art from file: ${localPath}`);

				} catch (e) {
					global.logWarning(`[music-display-additions@nicholasjdi] Could not load art from file: ${artPath}, Error: ${e}`);
					this._hideArt = true;
					this._updateLayout();
				}
			})
		);
	},

	_loadArtFromUrl: function (artUrl) {
		try {
			// Build GET message
			let message = Soup.Message.new('GET', artUrl);

			// Send asynchronously
			this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
				// Get bytes from response
				let bytes = this._soupSession.send_and_read_finish(res);
				// Check status code
				if (message.get_status() !== Soup.Status.OK) {
					global.logWarning(`[music-display-additions@nicholasjdi] Failed to download image: ${artUrl} status ${message.get_status()}`);
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
					global.log(`[music-display-additions@nicholasjdi] grabbed art from url: ${artUrl} to: ${tmpPath}`);
				}

				// Load it as local file
				this._loadArtFromFile(tmpPath);
				GLib.unlink(tmpPath);

			});
		} catch (e) {
			global.logWarning(`[music-display-additions@nicholasjdi] Could not load art from URL: ${artUrl}, Error: ${e}`);
			this._hideArt = true;
		} finally {if (this._hideArt) this._updateLayout();}
	},

	_updateLayout: function () {
		// set container size
		this.container.width = this.xSize;
		this.container.height = this.ySize;
		let aspectRatio = this._imageSize.width / this._imageSize.height;
		let containerRatio = this.xSize / this.ySize

		if (this.artEnabled && !this._hideArt && !this.disabled && !this._failArt) {
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
				this._artSize = {width: this._imageSize.width * scale,height: this._imageSize.height * scale};

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
			this._hideArt = false;
			this.art.hide();
			this.margin.style = "";
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
				if ((this.artEnabled || this._failArt) && !this.art.visible) {
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

				this.timeLabel.set_position(Math.round(anchorX), Math.round(anchorY));
				if (this.outlineEnabled) {
					this.outlineLabels[0].set_position(Math.round(anchorX + this.outlineSize), Math.round(anchorY));
					this.outlineLabels[1].set_position(Math.round(anchorX - this.outlineSize), Math.round(anchorY));
					this.outlineLabels[2].set_position(Math.round(anchorX), Math.round(anchorY - this.outlineSize));
					this.outlineLabels[3].set_position(Math.round(anchorX), Math.round(anchorY + this.outlineSize));
				}
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
		if (this._artTimeout) {
			GLib.source_remove(this._artTimeout);
			this._artTimeout = null;
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
