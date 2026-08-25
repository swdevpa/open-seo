import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays } from "lucide-react";

export function YoutubeDateRangeControls({
  startDate,
  endDate,
  onApply,
}: {
  startDate: string;
  endDate: string;
  onApply: (range: { startDate: string; endDate: string }) => void;
}) {
  const [draftStartDate, setDraftStartDate] = useState(startDate);
  const [draftEndDate, setDraftEndDate] = useState(endDate);

  useEffect(() => setDraftStartDate(startDate), [startDate]);
  useEffect(() => setDraftEndDate(endDate), [endDate]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftStartDate || !draftEndDate || draftStartDate > draftEndDate)
      return;
    onApply({ startDate: draftStartDate, endDate: draftEndDate });
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={submit}
      aria-label="YouTube date range"
    >
      <label className="form-control w-36">
        <span className="label py-0.5 text-xs text-base-content/60">From</span>
        <input
          type="date"
          className="input input-bordered input-sm"
          value={draftStartDate}
          onChange={(event) => setDraftStartDate(event.target.value)}
        />
      </label>
      <label className="form-control w-36">
        <span className="label py-0.5 text-xs text-base-content/60">To</span>
        <input
          type="date"
          className="input input-bordered input-sm"
          value={draftEndDate}
          onChange={(event) => setDraftEndDate(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn btn-outline btn-sm gap-1.5"
        disabled={
          !draftStartDate || !draftEndDate || draftStartDate > draftEndDate
        }
      >
        <CalendarDays className="size-4" />
        Apply
      </button>
    </form>
  );
}
