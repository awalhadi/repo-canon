use crate::notes::Note;

pub fn render_text(notes: &[&Note]) -> String {
    notes
        .iter()
        .map(|n| format!("#{} {} [{}]", n.id, n.title, n.tags.join(", ")))
        .collect::<Vec<_>>()
        .join("\n")
}

fn json_string(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn render_json(notes: &[&Note]) -> String {
    let items: Vec<String> = notes
        .iter()
        .map(|n| {
            let tags: Vec<String> = n.tags.iter().map(|t| json_string(t)).collect();
            format!("{{\"id\":{},\"title\":{},\"tags\":[{}]}}", n.id, json_string(&n.title), tags.join(","))
        })
        .collect();
    format!("{{\"count\":{},\"notes\":[{}]}}", notes.len(), items.join(","))
}
