/*
 * Experimental Kingpin characters: solid, mortal, and able to walk a path.
 * Included by g_spawn.c in the "kingpin" build flavour. SPDX: GPL-2.0-or-later.
 *
 * Written against the Quake II game module only. No Kingpin code is used, and
 * speeds and reactions are placeholders, not measurements of the original.
 *
 * Entities come from src/kingpin/map-props.ts:
 *   model    head model
 *   message  "<body model> <legs model> <idle> <walk> <pain> <death>", the last
 *            four being frame counts laid out consecutively in all three models
 *   target   first path_corner_cast to walk to (optional)
 */

#define KP_WALK_DISTANCE 6 /* units per server frame; provisional */
#define KP_ARRIVE_DISTANCE 24
#define KP_DEFAULT_HEALTH 100

void M_MoveToGoal(edict_t *ent, float dist);

enum { KP_IDLE, KP_WALK, KP_PAIN, KP_DEATH };

static int
KP_FirstFrame(const edict_t *self, int sequence)
{
	int i, first = 0;

	for (i = 0; i < sequence; i++)
	{
		first += self->kp_frames[i];
	}

	return first;
}

static void
KP_SetSequence(edict_t *self, int sequence)
{
	self->kp_sequence = sequence;
	self->s.frame = KP_FirstFrame(self, sequence);
}

/* Heads for the node with this name, or stops walking if there is none. */
static void
KP_SetNode(edict_t *self, char *name)
{
	vec3_t toward;

	self->movetarget = name ? G_PickTarget(name) : NULL;
	self->goalentity = self->movetarget;

	if (self->movetarget)
	{
		VectorSubtract(self->movetarget->s.origin, self->s.origin, toward);
		self->ideal_yaw = vectoyaw(toward);
	}
}

void
KP_CastThink(edict_t *self)
{
	int offset, wanted;

	self->nextthink = level.time + FRAMETIME;
	M_CheckGround(self);

	offset = self->s.frame - KP_FirstFrame(self, self->kp_sequence);

	if (self->kp_sequence == KP_DEATH)
	{
		if (offset + 1 < self->kp_frames[KP_DEATH])
		{
			self->s.frame++;
		}
		else
		{
			self->nextthink = 0; /* stay on the last frame */
		}

		return;
	}

	if (self->kp_sequence == KP_PAIN && offset + 1 < self->kp_frames[KP_PAIN])
	{
		self->s.frame++;
		return;
	}

	if (self->movetarget)
	{
		vec3_t toward;

		VectorSubtract(self->movetarget->s.origin, self->s.origin, toward);
		toward[2] = 0;

		if (VectorLength(toward) <= KP_ARRIVE_DISTANCE)
		{
			self->monsterinfo.pausetime = level.time + self->movetarget->wait;
			KP_SetNode(self, self->movetarget->target);
		}
	}

	wanted = (self->movetarget && level.time >= self->monsterinfo.pausetime) ? KP_WALK : KP_IDLE;

	if (wanted != self->kp_sequence)
	{
		KP_SetSequence(self, wanted);
	}
	else
	{
		self->s.frame = KP_FirstFrame(self, wanted) +
			(offset + 1) % self->kp_frames[wanted];
	}

	if (wanted == KP_WALK)
	{
		M_MoveToGoal(self, KP_WALK_DISTANCE);
	}
}

/* First think, after brush entities have linked. */
void
KP_CastStart(edict_t *self)
{
	M_droptofloor(self);
	KP_SetNode(self, self->combattarget);
	self->combattarget = NULL;
	self->think = KP_CastThink;
	self->nextthink = level.time + FRAMETIME;
}

void
KP_CastPain(edict_t *self, edict_t *other /* unused */,
		float kick /* unused */, int damage /* unused */)
{
	if (self->deadflag || level.time < self->pain_debounce_time)
	{
		return;
	}

	self->pain_debounce_time = level.time + 1;
	KP_SetSequence(self, KP_PAIN);
}

void
KP_CastDie(edict_t *self, edict_t *inflictor /* unused */,
		edict_t *attacker /* unused */, int damage /* unused */,
		vec3_t point /* unused */)
{
	if (self->deadflag == DEAD_DEAD)
	{
		return;
	}

	self->deadflag = DEAD_DEAD;
	self->takedamage = DAMAGE_NO;
	self->svflags |= SVF_DEADMONSTER;
	self->maxs[2] = -8; /* the body can be walked over */
	self->movetarget = self->goalentity = NULL;
	KP_SetSequence(self, KP_DEATH);
	self->think = KP_CastThink;
	self->nextthink = level.time + FRAMETIME;
	gi.linkentity(self);
	gi.dprintf("KP cast died at %s\n", vtos(self->s.origin));
}

static void
SP_kpweb_cast(edict_t *self)
{
	char body[MAX_QPATH], legs[MAX_QPATH];
	int *n = self->kp_frames;

	if (deathmatch->value || !self->model || !self->message ||
		sscanf(self->message, "%63s %63s %d %d %d %d", body, legs,
			&n[0], &n[1], &n[2], &n[3]) != 6 ||
		n[0] < 1 || n[1] < 1 || n[2] < 1 || n[3] < 1)
	{
		gi.dprintf("KP cast: unusable entity at %s\n", vtos(self->s.origin));
		G_FreeEdict(self);
		return;
	}

	self->s.modelindex = gi.modelindex(self->model);
	self->s.modelindex2 = gi.modelindex(body);
	self->s.modelindex3 = gi.modelindex(legs);
	/* Neither may reach Quake II's death handling, which prints and fires them. */
	self->message = NULL;
	self->combattarget = self->target;
	self->target = NULL;

	self->movetype = MOVETYPE_STEP;
	self->solid = SOLID_BBOX;
	self->clipmask = MASK_MONSTERSOLID;
	VectorSet(self->mins, -16, -16, -24);
	VectorSet(self->maxs, 16, 16, 48);

	/* A "good guy" monster takes damage without starting Quake II's combat AI,
	 * which this entity has no callbacks for. */
	self->svflags |= SVF_MONSTER;
	self->monsterinfo.aiflags |= AI_GOOD_GUY;
	self->takedamage = DAMAGE_AIM;
	self->deadflag = DEAD_NO;
	self->mass = 200;
	self->yaw_speed = 20;

	if (self->health <= 0)
	{
		self->health = KP_DEFAULT_HEALTH;
	}

	self->max_health = self->health;
	self->pain = KP_CastPain;
	self->die = KP_CastDie;
	self->think = KP_CastStart;
	self->nextthink = level.time + 2 * FRAMETIME;
	gi.linkentity(self);
	gi.dprintf("KP cast: %s at %s health %d\n", self->model,
			vtos(self->s.origin), self->health);
}

/* Path nodes are only looked up by name. */
static void
SP_path_corner_cast(edict_t *self)
{
	self->svflags |= SVF_NOCLIENT;
}
