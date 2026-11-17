/** Today as dd/mm/yyyy (digits and slashes only, so any font and either direction show it the same). */
export const todayLabel = (d = new Date()) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
