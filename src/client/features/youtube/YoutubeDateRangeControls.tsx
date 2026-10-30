import { Input } from "@/client/components/ui/input";
import { Button } from "@/client/components/ui/button";
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
      <label className="flex w-36 flex-col">
        <span className="py-0.5 text-xs text-muted-foreground">From</span>
        <Input
          type="date"
          value={draftStartDate}
          onChange={(event) => setDraftStartDate(event.target.value)}
        />
      </label>
      <label className="flex w-36 flex-col">
        <span className="py-0.5 text-xs text-muted-foreground">To</span>
        <Input
          type="date"
          value={draftEndDate}
          onChange={(event) => setDraftEndDate(event.target.value)}
        />
      </label>
      <Button
        variant="outline"
        size="sm"
        type="submit"
        className="gap-1.5"
        disabled={
          !draftStartDate || !draftEndDate || draftStartDate > draftEndDate
        }
      >
        <CalendarDays className="size-4" />
        Apply
      </Button>
    </form>
  );
}
