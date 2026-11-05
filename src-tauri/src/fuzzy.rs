//! Spelling-tolerant matching shared by file search and application lookup.
//!
//! People type "whatapp", "resme", "adhar", "chorme". Instead of alias lists per word, two general
//! signals decide whether a query word refers to a name token:
//! - edit distance (insert/delete/substitute/transpose), scaled to word length;
//! - a consonant "skeleton" (first letter + consonants, repeats collapsed), which captures
//!   transliteration variants such as adhar / aadhaar / aadhar -> "adhr".

/// Optimal-string-alignment distance (Levenshtein plus adjacent transpositions).
pub fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (n, m) = (a.len(), b.len());
    let mut d = vec![vec![0usize; m + 1]; n + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=m {
        d[0][j] = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[n][m]
}

/// First letter followed by the remaining consonants, with repeated letters collapsed.
pub fn skeleton(word: &str) -> String {
    let mut out = String::new();
    for (i, c) in word.chars().filter(|c| c.is_alphanumeric()).enumerate() {
        let c = c.to_ascii_lowercase();
        if i > 0 && "aeiouy".contains(c) {
            continue;
        }
        if out.ends_with(c) {
            continue;
        }
        out.push(c);
    }
    out
}

fn allowed_typos(len: usize) -> usize {
    match len {
        0..=3 => 0,
        4..=9 => 1,
        _ => 2,
    }
}

/// True when `query_word` is plausibly a misspelling or variant of `token`.
pub fn words_match(query_word: &str, token: &str) -> bool {
    let q = query_word.to_lowercase();
    let t = token.to_lowercase();
    if q == t {
        return true;
    }
    let shortest = q.chars().count().min(t.chars().count());
    if shortest < 4 {
        return false;
    }
    if edit_distance(&q, &t) <= allowed_typos(shortest) {
        return true;
    }
    let (sq, st) = (skeleton(&q), skeleton(&t));
    sq.len() >= 3 && sq == st && q.chars().next() == t.chars().next()
}

/// Split text into lowercase alphanumeric tokens.
pub fn tokens(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// True when `query_word` fuzzily matches any token of `text`.
pub fn matches_any_token(query_word: &str, text: &str) -> bool {
    tokens(text).iter().any(|t| words_match(query_word, t))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typos_and_transliterations_match() {
        assert!(words_match("whatapp", "whatsapp"));
        assert!(words_match("watsapp", "whatsapp"));
        assert!(words_match("chorme", "chrome"));
        assert!(words_match("resme", "resume"));
        assert!(words_match("adhar", "aadhaar"));
        assert!(words_match("aadhar", "aadhaar"));
        assert!(words_match("calcualtor", "calculator"));
        assert!(words_match("telegarm", "telegram"));
    }

    #[test]
    fn unrelated_words_do_not_match() {
        assert!(!words_match("teams", "steam"));
        assert!(!words_match("invoice", "voice"));
        assert!(!words_match("passport", "password"));
        assert!(!words_match("pan", "pen"));
        assert!(!words_match("resume", "result"));
        assert!(!words_match("adhar", "radar"));
        assert!(!words_match("excel", "access"));
        assert!(!words_match("photos", "photoshop"));
    }

    #[test]
    fn skeleton_examples() {
        assert_eq!(skeleton("aadhaar"), "adhr");
        assert_eq!(skeleton("adhar"), "adhr");
        assert_eq!(skeleton("WhatsApp"), "whtsp");
    }
}
