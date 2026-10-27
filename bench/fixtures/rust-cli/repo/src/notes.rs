#[derive(Debug, Clone, PartialEq)]
pub struct Note {
    pub id: u32,
    pub title: String,
    pub tags: Vec<String>,
}

/// Parses `id|title|tag,tag` lines.
pub fn parse(text: &str) -> Vec<Note> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '|');
            let id = parts.next()?.trim().parse().ok()?;
            let title = parts.next()?.trim().to_string();
            let tags = parts.next().unwrap_or("").split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();
            Some(Note { id, title, tags })
        })
        .collect()
}

pub fn filter<'a>(notes: &'a [Note], tag: Option<&str>) -> Vec<&'a Note> {
    notes.iter().filter(|n| tag.map_or(true, |t| n.tags.iter().any(|x| x == t))).collect()
}
