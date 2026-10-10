import { ArrowUpRight, Users } from 'lucide-react'

export type ClubCardData = {
  id: string
  name: string
  description: string
  scope: string
  members: number
  imageUrl?: string
}

type ClubCardProps = {
  club: ClubCardData
  onClick?: () => void
  isPlaceholder?: boolean
}

export default function ClubCard({
  club,
  onClick,
  isPlaceholder = false,
}: ClubCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-ink/10 bg-card text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl">

      {/* Club cover */}
      <div className="relative h-40 overflow-hidden bg-lilac">
        {club.imageUrl ? (
          <img
            src={club.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="relative h-full w-full overflow-hidden">
            <span
                aria-hidden="true"
                className="absolute -bottom-6 -right-1 select-none font-display text-[8rem] italic leading-none text-ink/90"
            >
                CH
            </span>
            </div>
        )}

        {isPlaceholder && (
          <span className="absolute right-3 top-3 rounded-full bg-butter px-3 py-1 text-xs font-semibold text-ink">
            Preview
          </span>
        )}
      </div>

      {/* Club information */}
      <div className="flex flex-1 flex-col p-5">

        <div>
          <span className="inline-flex rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold text-ink">
            {club.scope}
          </span>
        </div>

        <h3 className="mt-3 font-display text-[1.7rem] leading-tight text-ink">
          {club.name}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm text-ink-2">
          {club.description}
        </p>

        {/* Card footer */}
        <div className="mt-auto flex items-center justify-between pt-5">

          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
            <Users size={16} aria-hidden="true" />
            {isPlaceholder ? '—' : club.members}
          </span>

          {onClick ? (
            <button
              type="button"
              onClick={onClick}
              aria-label={`View ${club.name}`}
              className="grid size-9 place-items-center rounded-full bg-ink text-paper transition hover:bg-rose hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum"
            >
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full bg-ink/40 text-paper"
            >
              <ArrowUpRight size={16} />
            </span>
          )}

        </div>
      </div>
    </article>
  )
}