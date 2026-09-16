local function calcStrokes(offsetSeconds)
	if offsetSeconds == nil then return 200 end
	local ms = math.abs(offsetSeconds) * 1000
	if ms <= 4 then return 0 end
	if ms > 103.5 then return 200 end
	return math.floor(ms) - 4
end

-- Color gradient for per-note feedback: green at 0 strokes, red at 99+ strokes
local function strokeColor(strokes)
	if strokes == 0 then return 0.2, 1, 0.2 end
	if strokes >= 99 then return 1, 0.15, 0.15 end
	-- sqrt curve so yellow appears around +20 and red ramps in faster
	local t = math.sqrt(clamp(strokes / 99, 0, 1))
	return 0.2 + 0.8 * t, 1 - 0.85 * t, 0.2 - 0.05 * t
end

-- Match the score positioning from ScreenGameplay underlay/PerPlayer/Score.lua
local scorePos = {
	[PLAYER_1] = { x=(_screen.cx - clamp(_screen.w, 640, 854)/4.3),  y=56 },
	[PLAYER_2] = { x=(_screen.cx + clamp(_screen.w, 640, 854)/2.75), y=56 },
}

-- Difficulty meter position from ScreenGameplay underlay/PerPlayer/DifficultyMeter.lua
local diffPos = {
	[PLAYER_1] = { x=(_screen.cx + -1 * SL_WideScale(292.5, 342.5)), y=56 },
	[PLAYER_2] = { x=(_screen.cx + 1 * SL_WideScale(292.5, 342.5)),  y=56 },
}

local function makePlayerDisplay(pn)
	local player = (pn == "P1") and PLAYER_1 or PLAYER_2
	local state = { totalStrokes = 0, noteCount = 0 }

	-- Flash text goes to the right of P1's score, left of P2's score
	local flashOffsetX = (player == PLAYER_1) and 48 or -108

	return Def.ActorFrame{
		Name="Golf"..pn,
		InitCommand=function(self) self:visible(false):diffusealpha(0) end,

		GolfResetCommand=function(self)
			state.totalStrokes = 0
			state.noteCount = 0
			self:playcommand("GolfUpdate")
		end,

		JudgmentMessageCommand=function(self, params)
			if params.Player ~= player then return end

			local strokes = nil

			if params.TapNoteScore then
				local tns = ToEnumShortString(params.TapNoteScore)
				if tns == "HitMine" then
					strokes = 200
				elseif tns == "AvoidMine" then
					return
				elseif tns == "Miss" then
					strokes = 200
					state.noteCount = state.noteCount + 1
				else
					strokes = calcStrokes(params.TapNoteOffset)
					state.noteCount = state.noteCount + 1
				end
			end

			if params.HoldNoteScore then
				local hns = ToEnumShortString(params.HoldNoteScore)
				if hns == "LetGo" or hns == "MissedHold" then
					strokes = 200
				else
					return
				end
			end

			if strokes == nil then return end

			state.totalStrokes = state.totalStrokes + strokes

			self:playcommand("GolfUpdate")

			local flashText = (strokes == 0) and "ACE" or ("+" .. strokes)
			self:playcommand("GolfFlash", { text = flashText, strokes = strokes })
		end,

		-- Golf total score, styled like the original score but green
		LoadFont(ThemePrefs.Get("ThemeFont") .. " numbers")..{
			InitCommand=function(self)
				self:valign(1):horizalign(right)
				self:zoom(0.5)
				self:diffuse(0.2, 0.8, 0.2, 1)
				self:settext("0")
			end,
			GolfPositionCommand=function(self)
				local underlay = SCREENMAN:GetTopScreen():GetChild("Underlay")
				if underlay then
					local realScore = underlay:GetChild(pn.."Score")
					if realScore then
						self:xy(realScore:GetX(), realScore:GetY())
						return
					end
				end
				self:xy(scorePos[player].x, scorePos[player].y)
			end,
			GolfUpdateCommand=function(self)
				self:settext(("%.2f"):format(state.totalStrokes / 1000))
			end,
		},

		-- Per-note stroke flash next to the score
		LoadFont("Common Normal")..{
			InitCommand=function(self)
				self:valign(0):horizalign(right)
				self:zoom(1)
				self:diffuse(0.4, 0.75, 0.4, 1)
			end,
			GolfPositionCommand=function(self)
				local underlay = SCREENMAN:GetTopScreen():GetChild("Underlay")
				if underlay then
					local realScore = underlay:GetChild(pn.."Score")
					if realScore then
						self:xy(realScore:GetX() + flashOffsetX, realScore:GetY())
						return
					end
				end
				self:xy(scorePos[player].x + flashOffsetX, scorePos[player].y)
			end,
			GolfFlashCommand=function(self, params)
				self:finishtweening()
				self:settext(params.text)
				local r, g, b = strokeColor(params.strokes)
				self:diffuse(r, g, b, 1)
				self:sleep(0.4):linear(0.3):diffusealpha(0)
			end,
		},

		-- "Par" display covering the original difficulty meter
		Def.ActorFrame{
			GolfPositionCommand=function(self)
				self:xy(diffPos[player].x, diffPos[player].y)
			end,

			-- Green background quad (covers the original 30x30 difficulty quad)
			Def.Quad{
				InitCommand=function(self)
					self:zoomto(30, 30)
					self:diffuse(0.2, 0.8, 0.2, 1)
				end,
			},

			-- Par number
			LoadFont(ThemePrefs.Get("ThemeFont") .. " Bold")..{
				InitCommand=function(self)
					self:diffuse(Color.Black)
					self:zoom(0.4)
					self:y(-4)
					self:settext("3")
				end,
			},

			-- "Par" label
			LoadFont(ThemePrefs.Get("ThemeFont") .. " Normal")..{
				InitCommand=function(self)
					self:diffuse(Color.Black)
					self:y(9.5)
					self:zoom(0.5)
					self:settext("Par")
				end,
			},
		},
	}
end

-- Hide or show the real score actor by traversing the screen hierarchy
-- screen:GetChild("Underlay") IS the GameplayUnderlay ActorFrame directly
local function setScoreVisible(pn, visible)
	local screen = SCREENMAN:GetTopScreen()
	if not screen then return end
	local underlay = screen:GetChild("Underlay")
	if not underlay then return end
	local score = underlay:GetChild(pn.."Score")
	if score then score:visible(visible) end
	local scoreEx = underlay:GetChild(pn.."ScoreHardEx")
	if scoreEx then scoreEx:visible(visible) end
end

local t = Def.ActorFrame{
	ModuleCommand=function(self)
		self:GetChild("GolfP1"):visible(false)
		self:GetChild("GolfP2"):visible(false)

		if SCREENMAN:GetTopScreen():GetName() ~= "ScreenGameplay" then return end

		for _, player in ipairs(GAMESTATE:GetHumanPlayers()) do
			local pn = ToEnumShortString(player)
			setScoreVisible(pn, false)
			local golfAf = self:GetChild("Golf"..pn)
			golfAf:visible(true)
			golfAf:playcommand("GolfPosition")
			golfAf:playcommand("GolfReset")
			golfAf:linear(0.4):diffusealpha(1)
		end
	end,

	makePlayerDisplay("P1"),
	makePlayerDisplay("P2"),
}

return { ScreenGameplay = t }
