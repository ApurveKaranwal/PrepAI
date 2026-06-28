import re
import math
from typing import List, Dict

# Simple stopword list to filter out common grammatical noise
STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", 
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being", 
    "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't", 
    "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", 
    "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", 
    "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", 
    "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", 
    "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", 
    "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", 
    "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", 
    "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", 
    "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", 
    "theirs", "them", "themselves", "then", "there", "there's", "these", "they", 
    "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", 
    "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", 
    "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", 
    "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", 
    "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", 
    "your", "yours", "yourself", "yourselves"
}

class TFIDFModel:
    """
    A TF-IDF vectorizer and Cosine Similarity model written completely from scratch.
    """
    def __init__(self, corpus: List[str]):
        self.corpus = corpus
        self.doc_count = len(corpus)
        self.vocabulary: Dict[str, int] = {}
        self.idf: Dict[str, float] = {}
        self._build_vocab_and_idf()

    def _tokenize(self, text: str) -> List[str]:
        cleaned = re.sub(r"[^\w\s]", "", text.lower())
        tokens = cleaned.split()
        return [t for t in tokens if t not in STOPWORDS]

    def _build_vocab_and_idf(self):
        vocab_set = set()
        tokenized_corpus = []
        for doc in self.corpus:
            tokens = self._tokenize(doc)
            tokenized_corpus.append(tokens)
            vocab_set.update(tokens)
        
        self.vocabulary = {term: idx for idx, term in enumerate(sorted(vocab_set))}

        for term in self.vocabulary:
            doc_freq = sum(1 for tokens in tokenized_corpus if term in tokens)
            self.idf[term] = math.log((1 + self.doc_count) / (1 + doc_freq)) + 1

    def _get_tf_vector(self, tokens: List[str]) -> Dict[str, float]:
        tf = {}
        term_count = len(tokens)
        if term_count == 0:
            return tf
        for token in tokens:
            tf[token] = tf.get(token, 0) + 1
        for term in tf:
            tf[term] = tf[term] / term_count
        return tf

    def get_tfidf_vector(self, text: str) -> Dict[str, float]:
        tokens = self._tokenize(text)
        tf = self._get_tf_vector(tokens)
        tfidf = {}
        for term, tf_val in tf.items():
            if term in self.idf:
                tfidf[term] = tf_val * self.idf[term]
        return tfidf

    @staticmethod
    def cosine_similarity(vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
        dot_product = 0.0
        for term, val in vec1.items():
            if term in vec2:
                dot_product += val * vec2[term]
        
        mag1 = math.sqrt(sum(val ** 2 for val in vec1.values()))
        mag2 = math.sqrt(sum(val ** 2 for val in vec2.values()))
        
        if mag1 == 0.0 or mag2 == 0.0:
            return 0.0
        return dot_product / (mag1 * mag2)
