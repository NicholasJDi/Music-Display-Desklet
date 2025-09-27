const Desklet = imports.ui.desklet;
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
		this.position = "top_right";
		this.xOffset = -20;
		this.yOffset = 20;
		this.margin = 10;
		this.margin_color = "white";
		this.font = "sans 12";
		this.color = "white";
		this.textEnabled = true;
		this.art_enabled = true;

		this._currentInterval = null''

		// build container
		this.container = new St.Widget({ reactive: true });
		this.setContent(this.container);

		// cover art
		this.art = new St.Icon({ icon_size: this.xSize });
		this.container.add_actor(this.art);

		// single time label
		this.timeLabel = new St.Label({ text: "test", style: "" });
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
		this.settings.bind("margin_color", "margin_color", bind(this, this._updateLayout));
		this.settings.bind("font", "font", bind(this, this._updateFont));
		this.settings.bind("color", "color", bind(this, this._updateFont));
		this.settings.bind("text_enabled", "textEnabled", bind(this, this._updateLabelVisibility));
		this.settings.bind("art_enabled", "art_enabled", bind(this, this._updateLayout));
		this.settings.bind("poll_interval", "poll_interval", bind(this, this._resetPolling));
		this.settings.bind("idlePollInterval", "idlePollInterval", bind(this, this._resetPollingLayout));


		// initial setup
		this._updateLayout();
		this._updateFont();
		this._updateLabelVisibility();
		this._setArt("file:///home/joshua/.cache/rhythmbox/album-art/017");
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
		this._startPolling(pollInterval);
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

	_updateStatus: function() {
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
						this.labelTitle.set_text(this.line1_stopped.replace('%player%', firstPlayer));
						this.labelArtist.set_text(this.line2_stopped.replace('%player%', firstPlayer));
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

	// set the text from your code
	setTimeText: function (text) {
		this.timeLabel.text = text;
		this._positionLabel();
	},

	_setArt: function(artUrl) {
		if (!artUrl) {
			this.art.hide();
			return;
		}

		const setArt = (icon) => {
			this.art.gicon = icon;
			this.art.icon_size = this.artSize;
			this.art.show();
		};

		try {
			if (artUrl.startsWith('file://')) {
				// normalize local path
				let localPath = GLib.filename_from_uri(artUrl)[0];
				setArt(Gio.icon_new_for_string(localPath));
				return;
			}

			// download remote art into memory
			let session = new Soup.SessionAsync();
			let message = Soup.Message.new('GET', artUrl);

			session.queue_message(message, (session, msg) => {
				if (msg.status_code !== 200) {
					log(`[music-display] Failed to download art: ${artUrl}`);
					this.art.hide();
					return;
				}

				try {
					let bytes = msg.response_body.data;
					let loader = Gio.MemoryIcon.new(bytes, null);
					setArt(loader);
				} catch (e) {
					log(`[music-display] Error loading art from memory: ${e}`);
					this.art.hide();
				}
			});
		} catch (e) {
			log(`[music-display] Error processing art URL: ${e}`);
			this.art.hide();
		}
	},

	_updateLayout: function () {
		// set container size
		this.container.width = this.xSize;
		this.container.height = this.ySize;

		// show margin_color only if art is enabled AND art is visible
		if (this.art_enabled && this.art.visible && this.margin > 0) {
			this.container.style = `background-color: ${this.margin_color};`;
		} else {
			this.container.style = ""; // no background
		}

		// size and center art inside margins
		if (this.art_enabled) {
			const artSize = Math.min(this.xSize - 2 * this.margin, this.ySize - 2 * this.margin);
			this.art.icon_size = artSize;
			const artX = Math.round((this.xSize - artSize) / 2);
			const artY = Math.round((this.ySize - artSize) / 2);
			this.art.set_position(artX, artY);
			this.art.show();
		} else {
			this.art.hide();
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
		let style = desc.get_style();   // 0 = normal, 1 = oblique, 2 = italic

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

	_updateLabelVisibility: function () {
		if (this.textEnabled) this.timeLabel.show();
		else this.timeLabel.hide();
		this._positionLabel();
	},

	_positionLabel: function () {
		// run on idle so label size is known
		if (this._posTimeout) {
			try { GLib.source_remove(this._posTimeout); } catch (e) {}
		}
		this._posTimeout = GLib.timeout_add(
			GLib.PRIORITY_DEFAULT_IDLE,
			0,
			Lang.bind(this, function () {
				this._posTimeout = null;

				const labelW = this.timeLabel.get_width();
				const labelH = this.timeLabel.get_height();
				const dsW = this.container.width;
				const dsH = this.container.height;
				const m = this.margin;

				let anchorX = 0, anchorY = 0;
				switch (this.position) {
					case "top_left":	 anchorX = m;		 anchorY = m;		 break;
					case "top_right":	 anchorX = dsW - m;	 anchorY = m;		 break;
					case "bottom_left":  anchorX = m;		 anchorY = dsH - m;	 break;
					case "bottom_right": anchorX = dsW - m;	 anchorY = dsH - m;	 break;
					case "center":		 anchorX = dsW / 2;	 anchorY = dsH / 2;	 break;
					default:			 anchorX = dsW - m;	 anchorY = m;		 break;
				}

				let leftX, topY;
				if (this.position.endsWith("_left"))
					leftX = anchorX + this.xOffset;
				else if (this.position.endsWith("_right"))
					leftX = anchorX - labelW + this.xOffset;
				else
					leftX = anchorX - Math.round(labelW / 2) + this.xOffset;

				if (this.position.startsWith("top"))
					topY = anchorY + this.yOffset;
				else if (this.position.startsWith("bottom"))
					topY = anchorY - labelH + this.yOffset;
				else
					topY = anchorY - Math.round(labelH / 2) + this.yOffset;

				this.timeLabel.set_position(Math.round(leftX), Math.round(topY));
				return false;
			})
		);
	},

	on_desklet_removed: function () {
		if (this._posTimeout) {
			try { GLib.source_remove(this._posTimeout); } catch (e) {}
			this._posTimeout = null;
		}
	}
};

function main(metadata, instance_id) {
	return new MusicDisplayAdditionsDesklet(metadata, instance_id);
}
