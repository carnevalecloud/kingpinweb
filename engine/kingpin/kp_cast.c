/*
 * Experimental Kingpin characters: solid, mortal, able to walk a path and, if
 * they have a punch animation, to fight back.
 * Included by g_spawn.c in the "kingpin" build flavour. SPDX: GPL-2.0-or-later.
 *
 * Written against the Quake II game module only. No Kingpin code is used, and
 * speeds and reactions are placeholders, not measurements of the original.
 *
 * Entities come from src/kingpin/map-props.ts:
 *   model    head model
 *   message  "<body model> <legs model> <idle> <walk> <pain> <death> <run>
 *            <punch>", the numbers being frame counts laid out consecutively in
 *            all three models; run and punch are 0 for characters that cannot
 *            fight
 *   target   first path_corner_cast to walk to (optional)
 */

#define KP_WALK_DISTANCE 6 /* units per server frame; provisional */
#define KP_ARRIVE_DISTANCE 24
#define KP_RUN_DISTANCE 14 /* units per server frame; provisional */
#define KP_DEFAULT_HEALTH 100
/* Reach, strength and pace of a punch; all provisional. */
#define KP_PUNCH_REACH 64
#define KP_PUNCH_DAMAGE 8
#define KP_PUNCH_KICK 40
#define KP_PUNCH_REST 0.5
#define KP_PAIN_REST 3

void M_MoveToGoal(edict_t *ent, float dist);

enum { KP_IDLE, KP_WALK, KP_PAIN, KP_DEATH, KP_RUN, KP_PUNCH };

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

/* Shows the next frame of a looping sequence, switching to it if needed. */
static void
KP_Loop(edict_t *self, int sequence)
{
	if (self->kp_sequence != sequence)
	{
		KP_SetSequence(self, sequence);
		return;
	}

	self->s.frame = KP_FirstFrame(self, sequence) +
		(self->s.frame - KP_FirstFrame(self, sequence) + 1) %
		self->kp_frames[sequence];
}

static qboolean
KP_InReach(edict_t *self, edict_t *other)
{
	vec3_t toward;

	VectorSubtract(other->s.origin, self->s.origin, toward);

	if (fabs(toward[2]) > KP_PUNCH_REACH)
	{
		return false;
	}

	toward[2] = 0;

	return VectorLength(toward) <= KP_PUNCH_REACH && visible(self, other);
}

static void
KP_Face(edict_t *self, edict_t *other)
{
	vec3_t toward;

	VectorSubtract(other->s.origin, self->s.origin, toward);
	self->ideal_yaw = vectoyaw(toward);
	M_ChangeYaw(self);
}

/* Chases the enemy and punches when close enough. */
static void
KP_Fight(edict_t *self, int offset)
{
	edict_t *enemy = self->enemy;

	if (self->kp_sequence == KP_PUNCH && offset + 1 < self->kp_frames[KP_PUNCH])
	{
		self->s.frame++;
		KP_Face(self, enemy);

		/* The blow lands halfway through the swing, if still within reach. */
		if (offset + 1 == self->kp_frames[KP_PUNCH] / 2 &&
			KP_InReach(self, enemy))
		{
			vec3_t direction;

			VectorSubtract(enemy->s.origin, self->s.origin, direction);
			VectorNormalize(direction);
			T_Damage(enemy, self, self, direction, enemy->s.origin,
					vec3_origin, KP_PUNCH_DAMAGE, KP_PUNCH_KICK, 0, MOD_HIT);
			gi.dprintf("KP cast punched\n");
		}

		return;
	}

	if (KP_InReach(self, enemy))
	{
		KP_Face(self, enemy);

		if (level.time >= self->monsterinfo.attack_finished)
		{
			KP_SetSequence(self, KP_PUNCH);
			self->monsterinfo.attack_finished = level.time + KP_PUNCH_REST +
				self->kp_frames[KP_PUNCH] * FRAMETIME;
		}
		else
		{
			KP_Loop(self, KP_IDLE);
		}

		return;
	}

	KP_Loop(self, KP_RUN);
	self->goalentity = enemy;
	M_MoveToGoal(self, KP_RUN_DISTANCE);
}

/* Starts a fight with a player who hurt this character, if it knows how. */
static void
KP_Provoke(edict_t *self, edict_t *attacker)
{
	if (!attacker || !attacker->client || (attacker->flags & FL_NOTARGET) ||
		!self->kp_frames[KP_RUN] || !self->kp_frames[KP_PUNCH] ||
		self->enemy == attacker)
	{
		return;
	}

	self->enemy = attacker;
	gi.dprintf("KP cast angry at %s\n", vtos(self->s.origin));
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

	if (self->enemy)
	{
		if (self->enemy->inuse && self->enemy->health > 0)
		{
			KP_Fight(self, offset);
			return;
		}

		/* The fight is over; go back to the path. */
		self->enemy = NULL;
		self->goalentity = self->movetarget;
	}

	if (self->movetarget)
	{
		vec3_t toward;

		VectorSubtract(self->movetarget->s.origin, self->s.origin, toward);
		toward[2] = 0;

		if (VectorLength(toward) <= KP_ARRIVE_DISTANCE)
		{
			self->monsterinfo.pausetime = level.time + self->movetarget->wait;
			gi.dprintf("KP cast reached %s\n", self->movetarget->targetname);
			KP_SetNode(self, self->movetarget->target);
		}
	}

	wanted = (self->movetarget && level.time >= self->monsterinfo.pausetime) ? KP_WALK : KP_IDLE;

	KP_Loop(self, wanted);

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
KP_CastPain(edict_t *self, edict_t *other,
		float kick /* unused */, int damage /* unused */)
{
	if (self->deadflag)
	{
		return;
	}

	KP_Provoke(self, other);

	if (level.time < self->pain_debounce_time)
	{
		return;
	}

	self->pain_debounce_time = level.time + KP_PAIN_REST;
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
	self->movetarget = self->goalentity = self->enemy = NULL;
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
		sscanf(self->message, "%63s %63s %d %d %d %d %d %d", body, legs,
			&n[0], &n[1], &n[2], &n[3], &n[4], &n[5]) != 8 ||
		n[0] < 1 || n[1] < 1 || n[2] < 1 || n[3] < 1 || n[4] < 0 || n[5] < 0)
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
	 * which this entity has no callbacks for. Fighting is handled above. */
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
