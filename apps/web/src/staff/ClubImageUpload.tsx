import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
type Props = {
  value: string
  onChange: (url: string) => void
  accessToken: string
}

export default function ClubImageUpload({
  value,
  onChange,
  accessToken,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadImage(file: File) {
    setError('')

    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        file.type,
      )
    ) {
      setError('Choose a JPG, PNG, or WebP image.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5 MB.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)

    try {
      const response = await fetch(
        '/api/clubs/images/upload',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        },
      )

      if (!response.ok) {
        throw new Error(
          `Image upload failed (${response.status}).`,
        )
      }

      const result: { url: string } =
        await response.json()

      onChange(result.url)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to upload image.',
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold">
        Club image / logo URL

        <input
          type="url"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder="https://example.com/image.jpg"
          className="mt-2 w-full rounded-xl border border-ink/20 bg-card px-4 py-3"
        />
      </label>

    <div>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/png,image/jpeg,image/webp"
    disabled={uploading}
    className="sr-only"
    aria-label="Choose a club image from your computer"
    onChange={(event) => {
      const file = event.target.files?.[0]

      if (file) {
        void uploadImage(file)
      }

      event.target.value = ''
    }}
  />

  <button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    disabled={uploading}
    className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/20 bg-card px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/40 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <Upload size={17} />

    {uploading ? 'Uploading image...' : 'Upload photo from computer'}
  </button>

  <p className="mt-2 text-xs text-ink-2">
    JPG, PNG, or WebP · Maximum 5 MB
  </p>
</div>

      {uploading && (
        <p className="text-sm text-ink-2">
          Uploading image...
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose">
          {error}
        </p>
      )}

      {value && (
        <div>
          <img
            src={value}
            alt="Club image preview"
            className="h-36 w-full rounded-xl object-cover"
          />

          <button
            type="button"
            onClick={() => onChange('')}
            className="mt-2 text-sm font-semibold text-rose"
          >
            Remove image
          </button>
        </div>
      )}
    </div>
  )
}