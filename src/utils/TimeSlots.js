import * as dates from './dates'

const getDstOffset = (start, end) =>
  start.getTimezoneOffset() - end.getTimezoneOffset()

const getKey = (min, max, step, slots) =>
  `${+dates.startOf(min, 'minutes')}` +
  `${+dates.startOf(max, 'minutes')}` +
  `${step}-${slots}`

export function getSlotMetrics({ min: start, max: end, step, timeslots }) {
  const key = getKey(start, end, step, timeslots)

  // if the start is on a DST-changing day but *after* the moment of DST
  // transition we need to add those extra minutes to our minutesFromMidnight
  const daystart = dates.startOf(start, 'day')
  const daystartdstoffset = getDstOffset(daystart, start)
  const totalMin =
    1 + dates.diff(start, end, 'minutes') + getDstOffset(start, end)
  const minutesFromMidnight =
    dates.diff(daystart, start, 'minutes') + daystartdstoffset
  const numGroups = Math.ceil(totalMin / (step * timeslots))
  const numSlots = numGroups * timeslots

  const groups = new Array(numGroups)
  const slots = new Array(numSlots)
  // Each slot date is created from "zero", instead of adding `step` to
  // the previous one, in order to avoid DST oddities
  for (let grp = 0; grp < numGroups; grp++) {
    groups[grp] = new Array(timeslots)

    for (let slot = 0; slot < timeslots; slot++) {
      const slotIdx = grp * timeslots + slot
      const minFromStart = slotIdx * step
      // A date with total minutes calculated from the start of the day
      slots[slotIdx] = groups[grp][slot] = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        0,
        minutesFromMidnight + minFromStart,
        0,
        0
      )
    }
  }

  // Necessary to be able to select up until the last timeslot in a day
  const lastSlotMinFromStart = slots.length * step
  slots.push(
    new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0,
      minutesFromMidnight + lastSlotMinFromStart,
      0,
      0
    )
  )

  function positionFromDate(date) {
    const diff = dates.diff(start, date, 'minutes') + getDstOffset(start, date)
    return Math.min(diff, totalMin)
  }

  return {
    groups,
    update(args) {
      if (getKey(args) !== key) return getSlotMetrics(args)
      return this
    },

    dateIsInGroup(date, groupIndex) {
      const nextGroup = groups[groupIndex + 1]
      return dates.inRange(
        date,
        groups[groupIndex][0],
        nextGroup ? nextGroup[0] : end,
        'minutes'
      )
    },

    nextSlot(slot) {
      let next = slots[Math.min(slots.indexOf(slot) + 1, slots.length - 1)]
      // in the case of the last slot we won't a long enough range so manually get it
      if (next === slot) next = dates.add(slot, step, 'minutes')
      return next
    },

    closestSlotToPosition(percent) {
      const slot = Math.min(
        slots.length - 1,
        Math.max(0, Math.floor(percent * numSlots))
      )
      return slots[slot]
    },

    closestSlotFromPoint(point, boundaryRect) {
      let range = Math.abs(boundaryRect.top - boundaryRect.bottom)
      return this.closestSlotToPosition((point.y - boundaryRect.top) / range)
    },

    closestSlotFromDate(date, offset = 0) {
      if (dates.lt(date, start, 'minutes')) return slots[0]

      const diffMins = dates.diff(start, date, 'minutes')
      return slots[(diffMins - (diffMins % step)) / step + offset]
    },

    startsBeforeDay(date) {
      return dates.lt(date, start, 'day')
    },

    startsAfterDay(date) {
      return dates.gt(date, end, 'day')
    },

    startsBefore(date) {
      return dates.lt(dates.merge(start, date), start, 'minutes')
    },

    startsAfter(date) {
      return dates.gt(dates.merge(end, date), end, 'minutes')
    },

    getRange(rangeStart, rangeEnd, ignoreMin, ignoreMax) {
      if (!ignoreMin) rangeStart = dates.min(end, dates.max(start, rangeStart))
      if (!ignoreMax) rangeEnd = dates.min(end, dates.max(start, rangeEnd))

      const rangeStartMin = positionFromDate(rangeStart)
      const rangeEndMin = positionFromDate(rangeEnd)
      // step is measured in minutes
      const renderedInColumnCell = dates.lte(
        rangeEnd,
        dates.add(end, -step, 'minutes')
      )

      const top =
        rangeEndMin > step * (numSlots - 1) && renderedInColumnCell
          ? ((rangeStartMin - step) / (step * numSlots)) * 100
          : (rangeStartMin / (step * numSlots)) * 100

      return {
        top,
        height: (rangeEndMin / (step * numSlots)) * 100 - top,
        start: positionFromDate(rangeStart),
        startDate: rangeStart,
        end: positionFromDate(rangeEnd),
        endDate: rangeEnd,
      }
    },

    /**
     * like getRange, but gives back an array, which contains additional events
     * that can be rendered in the next column in week view, so the user gets
     * a preview of the dragged event in week view, even if it spans over multiple days
     */
    getRanges(rangeStart, rangeEnd, ignoreMin, ignoreMax) {
      if (!ignoreMin) rangeStart = dates.min(end, dates.max(start, rangeStart))
      if (!ignoreMax) rangeEnd = dates.min(end, dates.max(start, rangeEnd))

      const events = []
      const spannedDays = dates.range(rangeStart, rangeEnd, 'day').length

      // returns the date for "d", starting at 00:00:00
      function dayStartDate(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
      }

      for (let i = 0; i < spannedDays; i++) {
        const localRangeStart = dayStartDate(dates.add(rangeStart, 0, 'day'))
        const localRangeEnd = dates.add(rangeEnd, -i, 'day')
        const rangeStartMin = 0
        const rangeEndMin = positionFromDate(localRangeEnd)
        const renderedInLastColumnCell = dates.lte(
          localRangeEnd,
          dates.add(end, -step, 'minutes')
        )

        const top =
          rangeEndMin > step * (numSlots - 1) && renderedInLastColumnCell
            ? ((rangeStartMin - step) / (step * numSlots)) * 100
            : (rangeStartMin / (step * numSlots)) * 100

        events.push({
          top,
          height: (rangeEndMin / (step * numSlots)) * 100 - top,
          start: 0,
          startDate: dates.add(localRangeStart, -1, 'seconds'),
          end: positionFromDate(localRangeEnd),
          endDate: localRangeEnd,
          xOffset: 100 * i,
        })
      }
      return events.length > 1 ? events.slice(1) : null
    },

    getCurrentTimePosition(rangeStart) {
      const rangeStartMin = positionFromDate(rangeStart)
      const top = (rangeStartMin / (step * numSlots)) * 100

      return top
    },
  }
}
