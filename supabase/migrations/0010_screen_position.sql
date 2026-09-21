-- Screens can be drag-reordered on the dashboard. Seeded from the existing
-- id order so nothing visibly moves when this is first applied.
alter table screens add column position int not null default 0;

update screens s set position = ordered.rn - 1
from (select id, row_number() over (order by id) as rn from screens) ordered
where s.id = ordered.id;

-- Same atomic-reorder pattern as reorder_playlists in 0009.
create or replace function reorder_screens(p_ids bigint[])
returns void language plpgsql as $$
declare i int;
begin
  for i in 1..coalesce(array_length(p_ids, 1), 0) loop
    update screens set position = i - 1 where id = p_ids[i];
  end loop;
end;
$$;
