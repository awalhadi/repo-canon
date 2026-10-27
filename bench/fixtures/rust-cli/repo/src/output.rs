use crate::notes::Note;

pub fn render_text(notes: &[&Note]) -> String {
    notes
        .iter()
        .map(|n| format!("#{} {} [{}]", n.id, n.title, n.tags.join(", ")))
        .collect::<Vec<_>>()
        .join("\n")
}
