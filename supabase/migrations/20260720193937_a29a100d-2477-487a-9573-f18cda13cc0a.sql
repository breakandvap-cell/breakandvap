ALTER TABLE public.testimonials ADD COLUMN IF NOT EXISTS review_date date;
UPDATE public.testimonials SET review_date = created_at::date WHERE review_date IS NULL;