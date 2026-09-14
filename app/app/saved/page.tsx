import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { SavedExperience } from '@/components/product/saved-experience'
import { getCurrentUser } from '@/lib/server/auth/session'

// /app/saved - the parcels the user saved, across counties, sorted into their
// lists, plus every parcel they wrote a note on.
export default async function SavedPage() {
  if (!(await getCurrentUser())) redirect('/login')
  return (
    <div className="content-wide">
      {/* The chosen list lives in the query string (useSearchParams). */}
      <Suspense>
        <SavedExperience />
      </Suspense>
    </div>
  )
}
